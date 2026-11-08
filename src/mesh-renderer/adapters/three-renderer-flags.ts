import type * as THREE from "three";
import type { SceneObject } from "../../types";

export function syncMeshRendererFlags(body: THREE.Object3D, object: SceneObject): boolean {
  const visible = object.meshRenderer?.enabled !== false && !object.removedComponents?.includes("meshRenderer");
  let changed = body.visible !== visible;
  body.visible = visible;
  const castShadows = object.meshRenderer?.castShadows !== false;
  const receiveShadows = object.meshRenderer?.receiveShadows !== false;
  body.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.castShadow !== castShadows) {
      mesh.castShadow = castShadows;
      changed = true;
    }
    if (mesh.receiveShadow !== receiveShadows) {
      mesh.receiveShadow = receiveShadows;
      changed = true;
    }
  });
  return changed;
}

