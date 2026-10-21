import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  browserModelImportDraftRecoveryStorage,
  clearModelImportDraftRecovery,
  readModelImportDraftRecovery,
  writeModelImportDraftRecovery,
} from "../assets/adapters/browser/model-import-draft-recovery";
import type { LibraryAsset, ModelImportDocument } from "../lib/api";
import { fetchModelImport, saveModelImport } from "../lib/api";
import {
  defaultModelImportSettings,
  normalizeModelImportSettings,
  type ModelImportSettings,
} from "../lib/model-import-settings";

type Args = {
  asset: LibraryAsset | null;
  enabled: boolean;
  onSaved?: (asset: LibraryAsset, doc: ModelImportDocument) => void;
};

export type ModelImportSelectionToken = Readonly<{
  filename: string | null;
  generation: number;
}>;

export function nextModelImportSelectionToken(
  current: ModelImportSelectionToken,
  filename: string | null,
): ModelImportSelectionToken {
  return current.filename === filename
    ? current
    : { filename, generation: current.generation + 1 };
}

export function useModelImportSettings({ asset, enabled, onSaved }: Args) {
  const [document, setDocument] = useState<ModelImportDocument | null>(null);
  const [draft, setDraft] = useState<ModelImportSettings>(defaultModelImportSettings);
  const [loading, setLoading] = useState(false);
  const [savingGeneration, setSavingGeneration] = useState<number | null>(null);
  const [requestError, setRequestError] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [recovered, setRecovered] = useState(false);
  const [recoveryConflict, setRecoveryConflict] = useState(false);
  const selectedFilename = enabled && asset ? asset.filename : null;
  const selectionRef = useRef<ModelImportSelectionToken>({
    filename: selectedFilename,
    generation: 0,
  });
  const saveRequestRef = useRef(0);

  // A layout effect updates ownership before browser tasks can settle an old
  // save promise against the newly committed Inspector selection.
  useLayoutEffect(() => {
    const next = nextModelImportSelectionToken(selectionRef.current, selectedFilename);
    if (next === selectionRef.current) return;
    selectionRef.current = next;
    setSavingGeneration(null);
  }, [selectedFilename]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !asset) {
      setDocument(null);
      setDraft(defaultModelImportSettings);
      setRequestError("");
      setRecoveryError("");
      setRecovered(false);
      setRecoveryConflict(false);
      setLoading(false);
      return;
    }
    // Never render or submit the previous model's draft under a new asset
    // identity while its canonical import document is still loading.
    setDocument(null);
    setDraft(defaultModelImportSettings);
    setRequestError("");
    setRecoveryError("");
    setRecovered(false);
    setRecoveryConflict(false);
    setLoading(true);
    void fetchModelImport(asset.filename)
      .then((next) => {
        if (cancelled) return;
        const canonicalSettings = normalizeModelImportSettings(next.settings);
        const assetGuid = asset.guid?.trim() ?? "";
        const storage = browserModelImportDraftRecoveryStorage();
        const recovery = assetGuid && storage
          ? readModelImportDraftRecovery(storage, {
              assetGuid,
              canonicalRevision: next.revision,
              canonicalSettings,
            })
          : { status: "none" as const };
        setDocument(next);
        setRequestError("");
        if (recovery.status === "recovered") {
          setDraft(recovery.draftSettings);
          setRecovered(true);
          setRecoveryConflict(false);
          setRecoveryError("");
        } else if (recovery.status === "conflict") {
          setDraft(recovery.draftSettings);
          setRecovered(true);
          setRecoveryConflict(true);
          setRecoveryError(recovery.message);
        } else {
          setDraft(canonicalSettings);
          setRecovered(false);
          setRecoveryConflict(false);
          setRecoveryError(recovery.status === "error" ? recovery.message : "");
        }
      })
      .catch((caught) => {
        if (!cancelled) setRequestError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asset, enabled]);

  const patch = useCallback((next: Partial<ModelImportSettings>) => {
    setDraft((current) => normalizeModelImportSettings({ ...current, ...next }));
  }, []);

  const dirty = document
    ? JSON.stringify(normalizeModelImportSettings(document.settings)) !== JSON.stringify(draft)
    : false;

  useEffect(() => {
    if (!enabled || !asset || !document || document.sourceFilename !== asset.filename) return;
    if (recoveryConflict) return;
    const assetGuid = asset.guid?.trim() ?? "";
    if (!assetGuid) {
      if (dirty) setRecoveryError("Draft recovery requires a stable asset GUID.");
      return;
    }
    const storage = browserModelImportDraftRecoveryStorage();
    if (!storage) {
      if (dirty) {
        setRecoveryError(
          "Browser draft recovery is unavailable. Apply & Reimport before closing the editor.",
        );
      }
      return;
    }
    if (!dirty) {
      if (!recovered) return;
      const result = clearModelImportDraftRecovery(storage, assetGuid);
      if (!result.ok) {
        setRecoveryError(result.message);
        return;
      }
      setRecovered(false);
      setRecoveryError("");
      return;
    }
    const result = writeModelImportDraftRecovery(storage, {
      assetGuid,
      sourceFilename: asset.filename,
      baseRevision: document.revision,
      baseSettings: document.settings,
      draftSettings: draft,
    });
    setRecoveryError(result.ok ? "" : result.message);
  }, [asset, dirty, document, draft, enabled, recovered, recoveryConflict]);

  const persist = useCallback(async (settings: ModelImportSettings) => {
    if (!asset || !document || loading) {
      throw new Error("Import settings unavailable");
    }
    if (recoveryConflict) {
      const message = "Apply is blocked because the recovered importer draft conflicts with newer asset metadata.";
      setRecoveryError(message);
      throw new Error(message);
    }
    const selection = selectionRef.current;
    const requestId = saveRequestRef.current + 1;
    saveRequestRef.current = requestId;
    setSavingGeneration(selection.generation);
    try {
      const next = await saveModelImport(
        asset.filename,
        normalizeModelImportSettings(settings),
        document.revision,
      );
      if (selectionRef.current !== selection || saveRequestRef.current !== requestId) return;
      setDocument(next);
      setDraft(normalizeModelImportSettings(next.settings));
      setRequestError("");
      const assetGuid = asset.guid?.trim() ?? "";
      const storage = browserModelImportDraftRecoveryStorage();
      const cleared = assetGuid && storage
        ? clearModelImportDraftRecovery(storage, assetGuid)
        : { ok: true as const };
      setRecoveryError(cleared.ok ? "" : cleared.message);
      setRecovered(false);
      setRecoveryConflict(false);
      onSaved?.(asset, next);
    } catch (caught) {
      if (selectionRef.current === selection && saveRequestRef.current === requestId) {
        setRequestError(caught instanceof Error ? caught.message : String(caught));
      }
      throw caught;
    } finally {
      if (selectionRef.current === selection && saveRequestRef.current === requestId) {
        setSavingGeneration(null);
      }
    }
  }, [asset, document, loading, onSaved, recoveryConflict]);

  const save = useCallback(() => {
    void persist(draft).catch(() => undefined);
  }, [draft, persist]);

  const commit = useCallback(async (next: Partial<ModelImportSettings>) => {
    const nextDraft = normalizeModelImportSettings({ ...draft, ...next });
    setDraft(nextDraft);
    await persist(nextDraft);
  }, [draft, persist]);

  const revert = useCallback(() => {
    if (!document) return;
    const assetGuid = asset?.guid?.trim() ?? "";
    const storage = browserModelImportDraftRecoveryStorage();
    if (assetGuid && storage) {
      const result = clearModelImportDraftRecovery(storage, assetGuid);
      if (!result.ok) {
        setRecoveryError(result.message);
        return;
      }
    } else if (recovered || recoveryConflict) {
      setRecoveryError(
        "Browser draft recovery is unavailable, so the recovered draft could not be discarded.",
      );
      return;
    }
    setDraft(normalizeModelImportSettings(document.settings));
    setRequestError("");
    setRecoveryError("");
    setRecovered(false);
    setRecoveryConflict(false);
  }, [asset?.guid, document, recovered, recoveryConflict]);

  const saving = savingGeneration === selectionRef.current.generation;
  const error = requestError || recoveryError;
  return {
    document,
    draft,
    loading,
    saving,
    dirty,
    error,
    recovered,
    recoveryConflict,
    patch,
    commit,
    revert,
    save,
  };
}
