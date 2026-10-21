import * as THREE from "three";
import { expect, it } from "vitest";
import type { Runtime } from "../runtime";
import { captureCollisionMesh } from "./capture-collision-mesh";

it("captures object-local geometry while excluding editor chrome and separately authored children", () => {
  const root = new THREE.Group(); root.position.set(10, 20, 30); root.scale.setScalar(2);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)); mesh.position.x = 3; root.add(mesh);
  const child = new THREE.Group(); child.add(new THREE.Mesh(new THREE.SphereGeometry())); root.add(child);
  const chrome = new THREE.Mesh(new THREE.BoxGeometry()); chrome.userData.editorChrome = true; root.add(chrome);
  const runtime = { objectMap: new Map([["root", root], ["child", child]]) } as unknown as Runtime;
  const result = captureCollisionMesh(runtime, "root");
  expect(result.indices).toHaveLength(36); expect(result.vertices).toHaveLength(72);
  const xs = result.vertices.filter((_, i) => i % 3 === 0); expect(Math.min(...xs)).toBe(2); expect(Math.max(...xs)).toBe(4);
  expect(root.position.toArray()).toEqual([10, 20, 30]);
});
it("rejects unloaded or skinned geometry instead of persisting an approximate mesh", () => {
  const root = new THREE.Group(); const runtime = { objectMap: new Map([["root", root]]) } as unknown as Runtime;
  expect(() => captureCollisionMesh(runtime, "missing")).toThrow("not loaded");
  expect(() => captureCollisionMesh(runtime, "root")).toThrow("no loaded triangle");
  root.add(new THREE.SkinnedMesh(new THREE.BoxGeometry())); expect(() => captureCollisionMesh(runtime, "root")).toThrow("skinned");
});
