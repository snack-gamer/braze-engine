import * as THREE from "three";
import { expect, it } from "vitest";
import { captureGpuPoseHierarchy, pinGpuPoseTransforms } from "./gpu-pose-hierarchy";

it("captures child offsets and scale before pinning, excluding separately simulated descendants", () => {
  const root = new THREE.Group(); root.position.set(5, 2, 0); root.rotation.y = 0.6; root.scale.set(2, 2, 2);
  const child = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); child.position.set(1, 0.5, -2); child.scale.set(0.5, 1, 0.5); child.frustumCulled = false; root.add(child);
  const independent = new THREE.Group(); independent.add(new THREE.Mesh()); root.add(independent);
  const captured = captureGpuPoseHierarchy(root, new Set([root, independent]));
  expect(captured.meshes.size).toBe(1);
  const point = new THREE.Vector3().applyMatrix4(captured.meshes.get(child)!);
  expect(point.x).toBeCloseTo(1); expect(point.y).toBeCloseTo(0.5); expect(point.z).toBeCloseTo(-2);
  const matrix = child.matrix.clone(), world = child.matrixWorld.clone();
  const restore = pinGpuPoseTransforms([root, child]); root.updateMatrixWorld(true);
  expect(child.matrixWorld.equals(new THREE.Matrix4())).toBe(true);
  restore(); expect(child.matrix.equals(matrix)).toBe(true); expect(child.matrixWorld.equals(world)).toBe(true);
  expect(child.frustumCulled).toBe(false); expect(child.matrixWorldAutoUpdate).toBe(true);
});
