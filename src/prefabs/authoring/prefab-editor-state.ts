import type { LibraryAsset } from "../../lib/api";
import {
  selectedPrefabId,
  withPrefabRoots,
} from "../../lib/prefab-authoring";
import type { PrefabDocument } from "../../lib/prefabs";
import type { SceneObject } from "../../types";

export type PrefabEditorState = {
  asset: LibraryAsset;
  doc: PrefabDocument;
  revision: string | null;
  selectedId: string | null;
  past: PrefabDocument[];
  future: PrefabDocument[];
  dirty: boolean;
  saving: boolean;
  error: string;
};

export function createPrefabEditorState(
  asset: LibraryAsset,
  document: PrefabDocument,
  revision = asset.contentRevision ?? null,
  error = "",
): PrefabEditorState {
  const doc = withPrefabRoots(document);
  return {
    asset,
    doc,
    revision,
    selectedId: selectedPrefabId(doc, null),
    past: [],
    future: [],
    dirty: false,
    saving: false,
    error,
  };
}

export function undoPrefabEditorState(state: PrefabEditorState): PrefabEditorState {
  if (state.past.length === 0) return state;
  const doc = state.past[state.past.length - 1];
  return {
    ...state,
    doc,
    selectedId: selectedPrefabId(doc, state.selectedId),
    past: state.past.slice(0, -1),
    future: [state.doc, ...state.future],
    dirty: true,
    error: "",
  };
}

export function redoPrefabEditorState(state: PrefabEditorState): PrefabEditorState {
  if (state.future.length === 0) return state;
  const doc = state.future[0];
  return {
    ...state,
    doc,
    selectedId: selectedPrefabId(doc, state.selectedId),
    past: [...state.past, state.doc],
    future: state.future.slice(1),
    dirty: true,
    error: "",
  };
}

export function updatePrefabEditorObjects(
  state: PrefabEditorState,
  updater: (objects: SceneObject[]) => SceneObject[],
  nextSelectedId?: string | null,
): PrefabEditorState {
  const objects = updater(state.doc.objects);
  if (objects === state.doc.objects) {
    const selectedId = nextSelectedId === undefined ? state.selectedId : selectedPrefabId(state.doc, nextSelectedId);
    return selectedId === state.selectedId ? state : { ...state, selectedId };
  }
  const doc = withPrefabRoots(state.doc, objects);
  const selectedId = nextSelectedId !== undefined
    ? selectedPrefabId(doc, nextSelectedId)
    : selectedPrefabId(doc, state.selectedId);
  return {
    ...state,
    doc,
    selectedId,
    past: [...state.past, state.doc].slice(-100),
    future: [],
    dirty: true,
    error: "",
  };
}

export function beginPrefabSave(state: PrefabEditorState): PrefabEditorState {
  return { ...state, saving: true, error: "" };
}

export function completePrefabSave(
  state: PrefabEditorState,
  savedState: PrefabEditorState,
  asset: LibraryAsset,
  savedDocument: PrefabDocument,
  revision: string,
): PrefabEditorState {
  if (state.asset.filename !== savedState.asset.filename) return state;
  const hasNewerEdits = state.doc !== savedState.doc;
  return {
    ...state,
    asset: { ...asset, contentRevision: revision },
    doc: hasNewerEdits ? state.doc : savedDocument,
    revision,
    dirty: hasNewerEdits ? state.dirty : false,
    saving: false,
    error: "",
  };
}

export function failPrefabSave(
  state: PrefabEditorState,
  savedState: PrefabEditorState,
  error: unknown,
): PrefabEditorState {
  if (state.asset.filename !== savedState.asset.filename) return state;
  return {
    ...state,
    saving: false,
    error: error instanceof Error ? error.message : String(error),
  };
}
