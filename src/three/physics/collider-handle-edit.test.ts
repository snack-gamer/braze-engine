import { describe, expect, it } from "vitest";
import type { ColliderComponent } from "../../types";
import {
  colliderFacePatchFromPosition,
  colliderFacePosition,
} from "./collider-handle-edit";

const base: Pick<ColliderComponent, "shape" | "size" | "radius" | "length" | "majorRadius" | "minorRadius"> = {
  shape: "box",
  size: [1, 2, 3],
  radius: 0.5,
  length: 2,
  majorRadius: 1,
  minorRadius: 0.2,
};

describe("Collider Scene face handles", () => {
  it("moves one box face while preserving its opposite face", () => {
    const collider = { ...base, center: [0, 0, 0] as [number, number, number] };
    expect(colliderFacePosition(collider, 0, 1)).toEqual([0.5, 0, 0]);
    expect(colliderFacePatchFromPosition(collider, 0, 1, 1.5)).toEqual({
      center: [0.5, 0, 0],
      size: [2, 2, 3],
    });
  });

  it("maps sphere and capsule face handles to their native dimensions", () => {
    const collider = { ...base, center: [0, 0, 0] as [number, number, number] };
    expect(colliderFacePatchFromPosition({ ...collider, shape: "sphere" }, 1, 1, 1.25)).toEqual({ radius: 1.25 });
    expect(colliderFacePatchFromPosition({ ...collider, shape: "capsule" }, 0, 1, 2)).toEqual({ length: 3 });
    expect(colliderFacePatchFromPosition({ ...collider, shape: "capsule" }, 2, -1, -0.75)).toEqual({ radius: 0.75 });
    expect(colliderFacePatchFromPosition({ ...collider, shape: "capsule", axis: "y" }, 1, 1, 2)).toEqual({ length: 3 });
    expect(colliderFacePosition({ ...collider, shape: "capsule", axis: "y" }, 1, 1)).toEqual([0, 1.5, 0]);
  });
});
