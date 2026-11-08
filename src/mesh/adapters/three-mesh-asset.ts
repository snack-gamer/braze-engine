import * as THREE from "three";
import type { AssetLease, LoadedAsset } from "../../three/assets";
import { importedMeshSourceIndex, importedNodeSourcePath } from "../../three/imported-subasset-bindings";
import { getImportedObjectPath } from "../../three/imported-object-path";
import { disposeObject, retainObjectResource } from "../../three/dispose";
import type { MeshAssetBinding } from "../domain/mesh-reference";

function sourceIndex(mesh: THREE.Object3D): number | null {
  for (let node: THREE.Object3D | null = mesh; node; node = node.parent) {
    const index = importedMeshSourceIndex(node);
    if (index !== null) return index;
  }
  return null;
}

/** Cold attachment only. Each consumer owns materials; immutable geometry uses a source lease. */
export function cloneStaticMeshAsset(lease: AssetLease, source: LoadedAsset, binding: MeshAssetBinding): THREE.Group {
  const group = new THREE.Group();
  group.name = binding.name;
  retainObjectResource(group, lease.release);
  try {
    const meshes: THREE.Mesh[] = [];
    source.object.traverse((node) => { if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh); });
    const selected = meshes.filter((mesh) => binding.nodePath
      ? (importedNodeSourcePath(mesh) ?? getImportedObjectPath(source.object, mesh)) === binding.nodePath
      : binding.sourceIndex !== null && sourceIndex(mesh) === binding.sourceIndex);
    if (!selected.length) throw new Error(`Mesh '${binding.name}' is missing from its imported source. Reimport or choose another mesh.`);
    const seen = new Set<THREE.BufferGeometry>();
    for (const mesh of selected) {
      if (seen.has(mesh.geometry)) continue;
      seen.add(mesh.geometry);
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) throw new Error("Mesh Filter requires a static mesh; use the imported animated model for skinned geometry.");
      const material = Array.isArray(mesh.material) ? mesh.material.map(() => new THREE.MeshStandardMaterial()) : new THREE.MeshStandardMaterial();
      const clone = new THREE.Mesh(mesh.geometry, material);
      clone.name = mesh.name;
      clone.userData = { ...mesh.userData, sharedGeometry: true, originalMaterial: material };
      // Mesh references select local geometry, never a source scene instance's transform.
      group.add(clone);
    }
    return group;
  } catch (error) { disposeObject(group); throw error; }
}
