import { expect, it, vi } from "vitest";
import * as THREE from "three";
import { cloneStaticMeshAsset } from "./three-mesh-asset";
import { disposeObject } from "../../three/dispose";
import { stampGltfSubAssetBindings } from "../../three/imported-subasset-bindings";
import { applyMaterialsToBody } from "../../three/material-display";
import { makeObject } from "../../lib/payload";

it("selects exact geometry, deduplicates source instances, and keeps consumers independently owned", () => {
  const root = new THREE.Group(), box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: "red" }));
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial());
  root.add(box, sphere, box.clone());
  root.position.set(10, 20, 30); root.scale.setScalar(5);
  box.position.set(3, 4, 5); box.rotation.y = 1; box.scale.setScalar(2);
  stampGltfSubAssetBindings(new Map([[box, { meshes: 0 }], [sphere, { meshes: 1 }], [root.children[2], { meshes: 0 }]]));
  const source = { object: root, animations: [] }, releaseA = vi.fn(), releaseB = vi.fn();
  const binding = { localId: "mesh:Box", name: "Box", sourceIndex: 0, nodePath: null };
  const a = cloneStaticMeshAsset({ value: Promise.resolve(source), release: releaseA }, source, binding);
  const b = cloneStaticMeshAsset({ value: Promise.resolve(source), release: releaseB }, source, binding);
  expect(a.children).toHaveLength(1); expect(b.children).toHaveLength(1);
  const meshA = a.children[0] as THREE.Mesh, meshB = b.children[0] as THREE.Mesh;
  expect(meshA.geometry).toBe(box.geometry); expect(meshB.material).not.toBe(meshA.material);
  expect(meshA.position.toArray()).toEqual([0, 0, 0]); expect(meshA.scale.toArray()).toEqual([1, 1, 1]);
  expect(meshA.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  const dispose = vi.spyOn(box.geometry, "dispose");
  applyMaterialsToBody(a, makeObject("gltf", 0, { color: "#00ff00", assetMeshBinding: binding }));
  expect((meshA.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("00ff00");
  disposeObject(a); expect(releaseA).toHaveBeenCalledOnce(); expect(releaseB).not.toHaveBeenCalled(); expect(dispose).not.toHaveBeenCalled();
  expect(meshB.geometry.getAttribute("position").count).toBe(24);
  disposeObject(b); expect(releaseB).toHaveBeenCalledOnce(); expect(dispose).not.toHaveBeenCalled(); disposeObject(root);
});

it("fails missing bindings without retaining a lease or presenting the whole model", () => {
  const source = { object: new THREE.Group(), animations: [] }, release = vi.fn();
  expect(() => cloneStaticMeshAsset({ value: Promise.resolve(source), release }, source,
    { localId: "mesh:Missing", name: "Missing", sourceIndex: 9, nodePath: null })).toThrow("missing");
  expect(release).toHaveBeenCalledOnce();
});
