import * as THREE from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import type { PreparedAssetPreview } from "./prepared-asset-preview";

export async function prepareHdriAssetPreview(
  url: string,
  aspect: number,
  signal: AbortSignal,
): Promise<PreparedAssetPreview | null> {
  const lower = url.split("?", 1)[0].toLowerCase();
  const loader = lower.endsWith(".exr") ? new EXRLoader() : new RGBELoader();
  let texture: THREE.Texture;
  try {
    texture = (await loader.loadAsync(url)) as THREE.Texture;
  } catch {
    return null;
  }
  if (signal.aborted) {
    texture.dispose();
    return null;
  }

  texture.mapping = THREE.EquirectangularReflectionMapping;
  const scene = new THREE.Scene();
  scene.background = texture;
  const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 10);
  camera.lookAt(0, 0, -1);
  return {
    camera,
    scene,
    dispose: () => {
      scene.background = null;
      texture.dispose();
      scene.clear();
    },
  };
}
