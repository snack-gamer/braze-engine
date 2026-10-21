import type * as THREE from "three";
import type { AssetPreviewDescriptor } from "./asset-preview-source";
import { assetPreviewSourceUrl } from "./asset-preview-source";
import { prepareHdriAssetPreview } from "./hdri-asset-preview-content";
import { prepareMaterialAssetPreview } from "./material-asset-preview-content";
import { prepareModelAssetPreview } from "./model-asset-preview-content";

export type PreparedAssetPreview = Readonly<{
  scene: THREE.Scene;
  camera: THREE.Camera;
  dispose: () => void;
}>;

export function prepareAssetPreview(
  descriptor: AssetPreviewDescriptor,
  aspect: number,
  signal: AbortSignal,
): Promise<PreparedAssetPreview | null> {
  if (descriptor.kind === "material") {
    return prepareMaterialAssetPreview(descriptor.material, aspect, signal);
  }
  const url = assetPreviewSourceUrl(descriptor);
  return descriptor.kind === "model"
    ? prepareModelAssetPreview(url, aspect, signal)
    : prepareHdriAssetPreview(url, aspect, signal);
}
