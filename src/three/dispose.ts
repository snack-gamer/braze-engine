import * as THREE from "three";

const retainedResourceReleases = new WeakMap<THREE.Object3D, Set<() => void>>();

/** Transfers a resource lease to an Object3D subtree until that subtree dies. */
export function retainObjectResource(object: THREE.Object3D, release: () => void): void {
  const releases = retainedResourceReleases.get(object) ?? new Set<() => void>();
  releases.add(release);
  retainedResourceReleases.set(object, releases);
}

export function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const skeletons = new Set<THREE.Skeleton>();
  const releases = new Set<() => void>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const retained = retainedResourceReleases.get(child);
    if (retained) {
      retained.forEach((release) => releases.add(release));
      retainedResourceReleases.delete(child);
    }
    if (mesh.geometry && !mesh.userData.sharedGeometry) geometries.add(mesh.geometry);
    const skinned = child as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh && skinned.skeleton) skeletons.add(skinned.skeleton);
    const current = mesh.material;
    const stashed = mesh.userData.originalMaterial as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    const collect = (m: THREE.Material | THREE.Material[] | undefined) => {
      if (!m) return;
      if (Array.isArray(m)) {
        m.forEach(collect);
        return;
      }
      materials.add(m);
    };
    if (!mesh.userData.sharedMaterial) {
      collect(current as THREE.Material | THREE.Material[] | undefined);
      collect(stashed);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  skeletons.forEach((skeleton) => skeleton.dispose());
  releases.forEach((release) => {
    try {
      release();
    } catch (error) {
      console.error("[resource-lifetime] Object resource release failed", error);
    }
  });
}
