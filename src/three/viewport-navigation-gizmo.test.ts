import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  projectWorldDirection,
  viewDirectionVector,
  type ViewportView,
} from "./viewport-navigation-gizmo";

describe("viewport navigation gizmo math", () => {
  it.each([
    ["+x", [1, 0, 0]],
    ["-x", [-1, 0, 0]],
    ["+y", [0, 1, 0]],
    ["-y", [0, -1, 0]],
    ["+z", [0, 0, 1]],
    ["-z", [0, 0, -1]],
  ] as Array<[ViewportView, [number, number, number]]>)("maps %s to its world direction", (view, expected) => {
    expect(viewDirectionVector(view).toArray()).toEqual(expected);
  });

  it("projects world axes into screen space for the active camera", () => {
    const identity = new THREE.Quaternion();
    expect(projectWorldDirection(new THREE.Vector3(1, 0, 0), identity)).toEqual({ x: 1, y: -0, depth: 0 });
    expect(projectWorldDirection(new THREE.Vector3(0, 1, 0), identity)).toEqual({ x: 0, y: -1, depth: 0 });
    expect(projectWorldDirection(new THREE.Vector3(0, 0, 1), identity)).toEqual({ x: 0, y: -0, depth: 1 });

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 0, 0);
    camera.lookAt(0, 0, 0);
    const positiveX = projectWorldDirection(new THREE.Vector3(1, 0, 0), camera.quaternion);
    const negativeX = projectWorldDirection(new THREE.Vector3(-1, 0, 0), camera.quaternion);
    expect(positiveX.depth).toBeCloseTo(1, 8);
    expect(negativeX.depth).toBeCloseTo(-1, 8);
  });
});
