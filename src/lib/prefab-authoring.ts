import {
  ensurePrefabMasterRoot,
  prefabOverrideKeysForPatch,
  withPrefabOverrides,
  type PrefabDocument,
} from "./prefabs";
import type { PrefabOverrideKey, SceneObject } from "../types";

export function withPrefabRoots(doc: PrefabDocument, objects = doc.objects): PrefabDocument {
  return ensurePrefabMasterRoot({ ...doc, objects }, doc.name);
}

export function selectedPrefabId(doc: PrefabDocument, preferredId: string | null): string | null {
  if (preferredId && doc.objects.some((object) => object.id === preferredId)) return preferredId;
  return doc.rootIds[0] ?? doc.objects[0]?.id ?? null;
}

export function applyScenePatch(object: SceneObject, patch: Partial<SceneObject>): SceneObject {
  return withPrefabOverrides({ ...object, ...patch }, prefabOverrideKeysForPatch(patch));
}

export function markSceneOverrides(object: SceneObject, keys: PrefabOverrideKey[]): SceneObject {
  return withPrefabOverrides(object, keys);
}
