import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  importedMaterialSourceIndex,
  importedMeshSourceIndex,
  importedNodeSourceIndex,
  importedNodeSourcePath,
  stampGltfSubAssetBindings,
  stampTraversalSubAssetBindings,
} from "./imported-subasset-bindings";
import { getImportedObjectPath } from "./imported-object-path";

describe("imported subasset bindings", () => {
  it("builds escaped, duplicate-safe hierarchy paths", () => {
    const root = new THREE.Group();
    root.name = "Imported Root";
    const first = new THREE.Group();
    first.name = "Body/LOD[0]~source";
    const second = new THREE.Group();
    second.name = first.name;
    root.add(first, second);

    expect(getImportedObjectPath(root, first)).toBe("Body~1LOD~20~3~0source");
    expect(getImportedObjectPath(root, second)).toBe("Body~1LOD~20~3~0source[2]");
    expect(getImportedObjectPath(root, root)).toBe("Imported Root");
  });

  it("stamps deterministic traversal indices independent of insertion order", () => {
    const root = new THREE.Group();
    const materialA = new THREE.MeshStandardMaterial({ name: "Material A" });
    const materialB = new THREE.MeshStandardMaterial({ name: "Material B" });
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(), materialB);
    meshB.name = "B Mesh";
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(), [materialA, materialB]);
    meshA.name = "A Mesh";
    root.add(meshB, meshA);

    stampTraversalSubAssetBindings(root);

    expect(importedMeshSourceIndex(meshA)).toBe(0);
    expect(importedMeshSourceIndex(meshB)).toBe(1);
    expect(importedMaterialSourceIndex(materialA)).toBe(0);
    expect(importedMaterialSourceIndex(materialB)).toBe(1);
    expect(importedNodeSourcePath(meshA)).toBe("A Mesh");
    meshA.name = "Renamed After Import";
    expect(importedNodeSourcePath(meshA)).toBe("A Mesh");
  });

  it("preserves GLTF parser mesh and material associations", () => {
    const mesh = new THREE.Mesh();
    const primitive = new THREE.Mesh();
    mesh.add(primitive);
    const material = new THREE.MeshStandardMaterial();
    const unrelated = new THREE.Object3D();

    stampGltfSubAssetBindings(new Map<object, unknown>([
      [mesh, { meshes: 7, nodes: 11 }],
      [material, { materials: 3 }],
      [unrelated, { meshes: "2" }],
      [{}, { meshes: 8, materials: 9 }],
    ]));

    expect(importedMeshSourceIndex(mesh)).toBe(7);
    expect(importedNodeSourceIndex(mesh)).toBe(11);
    expect(importedNodeSourceIndex(primitive)).toBe(11);
    expect(importedMaterialSourceIndex(material)).toBe(3);
    expect(importedMeshSourceIndex(unrelated)).toBeNull();
    expect(importedNodeSourceIndex(unrelated)).toBeNull();
  });
});
