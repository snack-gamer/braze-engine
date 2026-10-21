import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { SceneObject, Vec3 } from "../../types";
import { compileHierarchyWorldTransforms } from "./hierarchy-world";

function transform(
  id: string,
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
  scale: Vec3 = [1, 1, 1],
  parentId?: string,
): Pick<SceneObject, "id" | "position" | "rotation" | "scale" | "parentId"> {
  return { id, position, rotation, scale, parentId };
}

describe("compileHierarchyWorldTransforms", () => {
  it("composes parent translation, rotation, and scale", () => {
    const objects = [
      transform("parent", [10, 2, 3], [0, 90, 0], [2, 2, 2]),
      transform("child", [1, 0, 0], [0, 0, 30], [0.5, 1, 1], "parent"),
    ];
    const result = compileHierarchyWorldTransforms(objects).get("child");
    expect(result).toBeDefined();
    expect(result!.position[0]).toBeCloseTo(10, 8);
    expect(result!.position[1]).toBeCloseTo(2, 8);
    expect(result!.position[2]).toBeCloseTo(1, 8);

    const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 6)));
    const actual = new THREE.Quaternion(...result!.orientation);
    expect(Math.abs(actual.dot(expected))).toBeCloseTo(1, 8);
    expect(result!.scale).toEqual([1, 2, 2]);
  });

  it("treats a missing parent as a root", () => {
    const result = compileHierarchyWorldTransforms([
      transform("child", [1, 2, 3], [0, 0, 0], [1, 1, 1], "missing"),
    ]).get("child");
    expect(result?.position).toEqual([1, 2, 3]);
  });

  it("terminates malformed cycles", () => {
    const result = compileHierarchyWorldTransforms([
      transform("a", [1, 0, 0], [0, 0, 0], [1, 1, 1], "b"),
      transform("b", [0, 2, 0], [0, 0, 0], [1, 1, 1], "a"),
    ]);
    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(true);
  });
});
