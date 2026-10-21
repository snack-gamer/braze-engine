import * as THREE from "three";
import { getImportedObjectPath } from "./imported-object-path";

const SOURCE_MESH_INDEX = "brazeSourceMeshIndex";
const SOURCE_MATERIAL_INDEX = "brazeSourceMaterialIndex";
const SOURCE_NODE_INDEX = "brazeSourceNodeIndex";
const SOURCE_NODE_PATH = "brazeSourceNodePath";

type SourceAssociation = Readonly<{
  meshes?: unknown;
  materials?: unknown;
  nodes?: unknown;
}>;

/** Stamps deterministic FBX/USD source indices before importer preparation mutates hierarchy order. */
export function stampTraversalSubAssetBindings(root: THREE.Object3D): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    object.userData[SOURCE_NODE_PATH] = getImportedObjectPath(root, object);
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  meshes.sort((left, right) => (
    importedNodeSourcePath(left)!.localeCompare(importedNodeSourcePath(right)!)
  ));
  const materials = new Set<THREE.Material>();
  let materialIndex = 0;
  meshes.forEach((mesh, sourceIndex) => {
    mesh.userData[SOURCE_MESH_INDEX] = sourceIndex;
    const materialSet = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materialSet.forEach((material) => {
      if (materials.has(material)) return;
      materials.add(material);
      material.userData[SOURCE_MATERIAL_INDEX] = materialIndex;
      materialIndex += 1;
    });
  });
}

/** Preserves GLTFLoader's exact source associations after the parser is released. */
export function stampGltfSubAssetBindings(associations: ReadonlyMap<object, unknown>): void {
  for (const [target, rawAssociation] of associations) {
    if (!rawAssociation || typeof rawAssociation !== "object") continue;
    const association = rawAssociation as SourceAssociation;
    if (target instanceof THREE.Object3D) {
      if (typeof association.meshes === "number" && Number.isInteger(association.meshes)) {
        target.userData[SOURCE_MESH_INDEX] = association.meshes;
      }
      if (typeof association.nodes === "number" && Number.isInteger(association.nodes)) {
        target.userData[SOURCE_NODE_INDEX] = association.nodes;
      }
    } else if (target instanceof THREE.Material
        && typeof association.materials === "number"
        && Number.isInteger(association.materials)) {
      target.userData[SOURCE_MATERIAL_INDEX] = association.materials;
    }
  }
}

export function importedMeshSourceIndex(mesh: THREE.Object3D): number | null {
  const value = mesh.userData[SOURCE_MESH_INDEX];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function importedMaterialSourceIndex(material: THREE.Material): number | null {
  const value = material.userData[SOURCE_MATERIAL_INDEX];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function importedNodeSourceIndex(object: THREE.Object3D): number | null {
  let cursor: THREE.Object3D | null = object;
  while (cursor) {
    const value = cursor.userData[SOURCE_NODE_INDEX];
    if (typeof value === "number" && Number.isInteger(value)) return value;
    cursor = cursor.parent;
  }
  return null;
}

export function importedNodeSourcePath(object: THREE.Object3D): string | null {
  const value = object.userData[SOURCE_NODE_PATH];
  return typeof value === "string" && value.length > 0 ? value : null;
}
