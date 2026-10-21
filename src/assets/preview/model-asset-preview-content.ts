import * as THREE from "three";
import { loadAndPrepareAsset } from "../../three/assets";
import { disposeImportedAssetSource } from "../../three/resources/imported-asset-lifetime";
import { modelPreviewPrimitive } from "./asset-preview-source";
import type { PreparedAssetPreview } from "./prepared-asset-preview";

function createCamera(object: THREE.Object3D, aspect: number): THREE.PerspectiveCamera | null {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return null;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return null;

  const fieldOfView = 32;
  const distance = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(fieldOfView / 2))) * 1.14;
  const direction = new THREE.Vector3(1, 0.62, 1).normalize();
  const camera = new THREE.PerspectiveCamera(
    fieldOfView,
    aspect,
    Math.max(0.001, distance - sphere.radius * 1.5),
    distance + sphere.radius * 4,
  );
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  camera.lookAt(sphere.center);
  return camera;
}

export async function prepareModelAssetPreview(
  url: string,
  aspect: number,
  signal: AbortSignal,
): Promise<PreparedAssetPreview | null> {
  let loaded;
  try {
    loaded = await loadAndPrepareAsset(url, modelPreviewPrimitive(url));
  } catch {
    return null;
  }
  if (signal.aborted) {
    disposeImportedAssetSource(loaded);
    return null;
  }
  const camera = createCamera(loaded.object, aspect);
  if (!camera) {
    disposeImportedAssetSource(loaded);
    return null;
  }

  const scene = new THREE.Scene();
  scene.add(loaded.object);
  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x343943, 1.45));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3.5, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9dbfff, 1.2);
  rim.position.set(-4, 2, -3);
  scene.add(rim);
  return {
    camera,
    scene,
    dispose: () => {
      scene.remove(loaded.object);
      disposeImportedAssetSource(loaded);
      scene.clear();
    },
  };
}
