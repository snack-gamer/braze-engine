import type { SceneObject } from "../domain/scene-object";
const ASSET_GUID = /^[a-f0-9]{32}$/i;

type AnimatorSceneObjectSource = Pick<
  SceneObject,
  "assetMissing" | "assetRef" | "assetUrl" | "primitive"
>;

export type AnimatorImportedAssetCatalog = Readonly<{
  ready: boolean;
  importedAssets: readonly Readonly<{
    guid?: string;
    kind?: string;
    status?: string;
    filename: string;
    subAssets?: readonly Readonly<{ kind?: string; localId?: string }>[];
  }>[];
}>;

function isSupportedAnimatorModelPrimitive(primitive: SceneObject["primitive"]): boolean {
  return primitive === "fbx" || primitive === "gltf";
}

/** Explains why the current Three playback backend cannot own this object. */
export function animatorComponentUnavailableReason(
  object: AnimatorSceneObjectSource,
  catalog?: AnimatorImportedAssetCatalog,
): string | undefined {
  if (!isSupportedAnimatorModelPrimitive(object.primitive)) {
    return "Animator playback requires a fully analyzed imported FBX, GLB, or glTF model.";
  }
  if (!object.assetRef || !ASSET_GUID.test(object.assetRef.guid)) {
    return "Animator playback requires a durable imported model reference.";
  }
  if (object.assetRef.localId !== undefined && object.assetRef.localId !== "main") {
    return "Animator playback must target the imported model's main asset, not one of its sub-assets.";
  }
  if (object.assetMissing || !object.assetUrl?.trim()) {
    return "Animator playback requires an available imported model source.";
  }
  if (!catalog) return undefined;
  if (!catalog.ready) {
    return "Character assets are still loading; Animator authoring will be available when the catalogs are ready.";
  }
  const guid = object.assetRef.guid.toLowerCase();
  const imported = catalog.importedAssets.find((asset) => asset.guid?.toLowerCase() === guid);
  if (!imported) {
    return "Animator playback requires this model to be present in the ready Asset Database catalog.";
  }
  const extension = imported.filename.split(".").pop()?.toLowerCase();
  const analyzedStatus = imported.status === "ready" || imported.status === "dirty";
  if (imported.kind !== "model" || !analyzedStatus
    || (extension !== "fbx" && extension !== "glb" && extension !== "gltf")) {
    return "Animator playback requires a successfully analyzed FBX, GLB, or glTF model.";
  }
  return undefined;
}
