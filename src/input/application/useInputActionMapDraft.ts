import { useCallback, useEffect, useRef, useState } from "react";
import type { LibraryAsset } from "../../lib/asset-api";
import type { InputActionMapAsset } from "../domain/input-action-map-asset";
import { decodeInputActionMapAsset } from "../serialization/input-action-map-asset-codec";
import { fetchInputActionMapAsset, saveInputActionMapAsset, InputAssetSaveConflictError } from "../adapters/input-action-map-api";

type DraftState = {
  draft: InputActionMapAsset | null;
  base: InputActionMapAsset | null;
  revision: string | null;
  loading: boolean;
  saving: boolean;
  error: string;
  validation: string;
  conflict: boolean;
};
const emptyState = (): DraftState => ({ draft: null, base: null, revision: null, loading: true,
  saving: false, error: "", validation: "", conflict: false });
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Source edits use a canonical revision. Failed reads never become write bases. */
export function useInputActionMapDraft(asset: LibraryAsset, onSaved: () => void) {
  const [state, setState] = useState<DraftState>(emptyState);
  const generation = useRef(0), loadRequest = useRef<AbortController | null>(null);
  const savePending = useRef(false);
  const identity = asset.guid ?? asset.filename;
  const assetRef = useRef(asset);
  assetRef.current = asset;
  const reload = useCallback(async () => {
    const request = ++generation.current;
    loadRequest.current?.abort();
    const abort = new AbortController();
    loadRequest.current = abort;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const canonical = await fetchInputActionMapAsset(assetRef.current, abort.signal);
      if (request !== generation.current) return;
      setState({ draft: canonical.document, base: canonical.document, revision: canonical.revision,
        loading: false, saving: false, error: "", validation: "", conflict: false });
    } catch (failure) {
      if (request === generation.current && !abort.signal.aborted) {
        setState((current) => ({ ...current, loading: false, error: message(failure) }));
      }
    }
  }, [identity]);
  useEffect(() => {
    setState(emptyState()); savePending.current = false;
    void reload();
    return () => { generation.current++; loadRequest.current?.abort(); };
  }, [reload]);
  const edit = (update: (draft: InputActionMapAsset) => InputActionMapAsset) => {
    setState((current) => {
      if (!current.draft || current.loading) return current;
      const draft = update(current.draft);
      let validation = "";
      try { decodeInputActionMapAsset(draft); } catch (failure) { validation = message(failure); }
      return { ...current, draft, validation };
    });
  };
  const save = async () => {
    if (!state.draft || !state.revision || state.loading || state.validation || state.conflict || savePending.current) return;
    savePending.current = true;
    const request = generation.current, submitted = state.draft;
    setState((current) => ({ ...current, saving: true, error: "" }));
    try {
      const canonical = await saveInputActionMapAsset(asset, submitted, state.revision);
      if (request !== generation.current) return;
      setState((current) => ({ ...current, base: canonical.document, revision: canonical.revision,
        draft: current.draft === submitted ? canonical.document : current.draft, saving: false, error: "" }));
      onSaved();
    } catch (failure) {
      if (request === generation.current) setState((current) => ({ ...current, saving: false,
        conflict: failure instanceof InputAssetSaveConflictError, error: message(failure) }));
    } finally { if (request === generation.current) savePending.current = false; }
  };
  const dirty = state.draft !== null && JSON.stringify(state.draft) !== JSON.stringify(state.base);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return { ...state, dirty, edit, save, revert: reload, reload };
}
