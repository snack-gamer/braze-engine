import type { AssetRef } from "../../assets/domain/asset-reference";

export type PrefabOverrideKey =
  | "name"
  | "tags"
  | "color"
  | "visibility"
  | "lock"
  | "transform"
  | "hierarchy"
  | "asset"
  | "botProfile"
  | "materialId"
  | "importedMaterialBindings"
  | "meshRenderer"
  | "water"
  | "cloner"
  | "particle"
  | "camera"
  | "directionalLight"
  | "modifiers"
  | "display"
  | "rowStyle"
  | "components";

export type PrefabLink = {
  prefabRef?: AssetRef;
  prefabFilename: string;
  prefabName: string;
  instanceId: string;
  sourceObjectId: string;
  overrides?: PrefabOverrideKey[];
};
