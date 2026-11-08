import type { LibraryAsset } from "../../lib/asset-api";
import type { SceneObject } from "../../scene/domain/scene-object";
import { meshBindingForReference } from "./mesh-assignment";

/** Reimport/deletion can change bindings; only the stable reference survives. */
export function resolveMeshAsset(object: SceneObject, asset: LibraryAsset | undefined, assetUrl?: string): SceneObject {
  try {
    const { binding } = meshBindingForReference({ kind: "asset", asset: object.assetRef! }, asset ? [asset] : []);
    if (object.assetUrl === assetUrl && object.assetName === asset!.name && !object.assetMissing
      && JSON.stringify(binding) === JSON.stringify(object.assetMeshBinding)) return object;
    return { ...object, assetName: asset!.name, assetUrl, assetMissing: false, assetMeshBinding: binding };
  } catch {
    if (object.assetMissing && !object.assetUrl && !object.assetMeshBinding) return object;
    return { ...object, assetUrl: undefined, assetMissing: true, assetMeshBinding: undefined };
  }
}
