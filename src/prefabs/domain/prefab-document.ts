import type { SceneObject } from "../../scene/domain/scene-object";

export const PREFAB_DOCUMENT_VERSION = "braze/prefab-v1" as const;
export const PREFAB_ASSET_SUFFIX = ".braze-prefab.json";
export const LEGACY_PREFAB_ASSET_SUFFIX = ".tganprefab.json";
export const PREFAB_ASSET_RE = /\.(?:braze-prefab|tganprefab)\.json$/i;

export type PrefabDocument = {
  version: typeof PREFAB_DOCUMENT_VERSION;
  name: string;
  createdAt: string;
  savedAt?: string;
  rootIds: string[];
  objects: SceneObject[];
};
