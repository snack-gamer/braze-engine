import * as THREE from "three";
import type { AssetCache, LoadedAsset } from "../../three/assets";
import {
  cloneImportedAsset,
  disposeStaleImportedClone,
} from "../../three/resources/imported-asset-lifetime";
import { assetPreviewSourceUrl, modelPreviewPrimitive } from "./asset-preview-source";
import type { ModelPreviewExtension } from "./model-preview-extension";
import { disposePreviewResource } from "./preview-resource-lifetime";

export type ModelPreviewContent = Readonly<{
  source: LoadedAsset;
  bounds: THREE.Sphere;
  box: THREE.Box3;
}>;

export type ModelPreviewContentOptions = Readonly<{
  assetCache: AssetCache;
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  extension: ModelPreviewExtension | null;
  url: string;
  revision?: string | null;
  requestRender: () => void;
  isActive: () => boolean;
}>;

/** Loads and attaches one stale-safe imported model to an interactive preview stage. */
export async function loadModelPreviewContent(
  options: ModelPreviewContentOptions,
): Promise<ModelPreviewContent | null> {
  const sourceUrl = assetPreviewSourceUrl({
    kind: "model",
    url: options.url,
    revision: options.revision,
    size: "inspector",
  });
  const lease = options.assetCache.acquire(sourceUrl, modelPreviewPrimitive(sourceUrl));
  let source: LoadedAsset;
  try {
    const shared = await lease.value;
    if (!options.isActive()) {
      lease.release();
      return null;
    }
    source = {
      object: cloneImportedAsset(lease, shared),
      animations: shared.animations,
    };
  } catch {
    lease.release();
    return null;
  }
  if (!options.isActive()) {
    disposeStaleImportedClone(source.object);
    return null;
  }

  source.object.traverse((node) => {
    if ((node as THREE.Light).isLight) node.visible = false;
  });
  options.scene.add(source.object);
  let frameObjects: readonly THREE.Object3D[] = [source.object];
  try {
    const attachment = options.extension?.attach({
      canvas: options.canvas,
      scene: options.scene,
      camera: options.camera,
      root: source.object,
      animations: source.animations,
      requestRender: options.requestRender,
    });
    if (attachment?.frameObjects.length) frameObjects = attachment.frameObjects;
  } catch {
    releaseModelPreviewContent(options.scene, options.extension, { source });
    return null;
  }

  const box = new THREE.Box3();
  for (const object of frameObjects) {
    object.updateWorldMatrix(true, true);
    box.expandByObject(object);
  }
  const bounds = box.isEmpty() ? null : box.getBoundingSphere(new THREE.Sphere());
  if (!bounds || !Number.isFinite(bounds.radius) || bounds.radius <= 0) {
    releaseModelPreviewContent(options.scene, options.extension, { source });
    return null;
  }
  return { source, bounds, box };
}

export function releaseModelPreviewContent(
  scene: THREE.Scene,
  extension: ModelPreviewExtension | null,
  content: Pick<ModelPreviewContent, "source">,
): void {
  disposePreviewResource("model preview attachment", () => extension?.detach());
  disposePreviewResource("model preview scene attachment", () => scene.remove(content.source.object));
  disposePreviewResource("model preview imported clone", () => {
    disposeStaleImportedClone(content.source.object);
  });
}
