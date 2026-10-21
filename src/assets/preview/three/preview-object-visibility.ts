import type * as THREE from "three";

/** Applies a temporary preview-only visibility policy and returns an idempotent restore callback. */
export function overridePreviewObjectVisibility(
  root: THREE.Object3D,
  resolve: (object: THREE.Object3D) => boolean | undefined,
): () => void {
  const authoredVisibility = new Map<THREE.Object3D, boolean>();
  root.traverse((object) => {
    const visible = resolve(object);
    if (visible === undefined) return;
    authoredVisibility.set(object, object.visible);
    object.visible = visible;
  });
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    authoredVisibility.forEach((visible, object) => {
      object.visible = visible;
    });
    authoredVisibility.clear();
  };
}

/** Shows selected meshes and required ancestors without re-enabling imported lights. */
export function isolatePreviewMeshes(
  root: THREE.Object3D,
  meshes: readonly THREE.Mesh[],
): () => void {
  const visible = new Set<THREE.Object3D>();
  for (const mesh of meshes) {
    let object: THREE.Object3D | null = mesh;
    while (object) {
      visible.add(object);
      if (object === root) break;
      object = object.parent;
    }
  }
  return overridePreviewObjectVisibility(root, (object) => {
    if ((object as THREE.Light).isLight) return false;
    if (visible.has(object)) return true;
    return (object as THREE.Mesh).isMesh ? false : undefined;
  });
}
