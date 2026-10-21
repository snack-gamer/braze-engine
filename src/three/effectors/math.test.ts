import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { defaultEffectorSettings } from "../../lib/effector";
import {
  axisCorrection,
  eulerQuat,
  qconj,
  qmul,
  qnormalize,
  qrot,
} from "./math";
import { pushCorrection } from "./push-apart";
import { buildEffectorRuntime, effectorWeight } from "./runtime-builder";

describe("Braze effector runtime math", () => {
  it("composes and inverts quaternion rotations in the reference order", () => {
    const rotation = eulerQuat([Math.PI / 2, 0, 0]);
    const rotated = qrot(rotation, [0, 1, 0]);
    expect(rotated[0]).toBeCloseTo(0, 8);
    expect(rotated[1]).toBeCloseTo(0, 8);
    expect(rotated[2]).toBeCloseTo(1, 8);
    expect(qnormalize(qmul(rotation, qconj(rotation)))).toEqual([0, 0, 0, 1]);
    expect(axisCorrection(0)).toEqual([0, 0, 0, 1]);
  });

  it("samples sphere falloff in world space and excludes points outside", () => {
    const node = new THREE.Object3D();
    node.position.set(2, 0, 0);
    node.updateMatrixWorld(true);
    const runtime = buildEffectorRuntime(
      { ...defaultEffectorSettings, shape: "sphere", radius: 2, strength: 0.75 },
      node,
      new Map(),
    );
    expect(effectorWeight(runtime, [2, 0, 0])).toBeCloseTo(0.75, 6);
    expect(effectorWeight(runtime, [5, 0, 0])).toBe(0);
  });

  it("preserves axis-restricted and coincident push-apart corrections", () => {
    expect(pushCorrection([0.5, 0, 0], 2, 1, 1, 2)).toEqual([1.5, 0, 0]);
    expect(pushCorrection([3, 0, 0], 2, 0, 1, 2)).toBeNull();
    const coincident = pushCorrection([0, 0, 0], 2, 0, 1, 2);
    expect(coincident).not.toBeNull();
    expect(Math.hypot(...(coincident ?? [0, 0, 0]))).toBeCloseTo(2, 8);
  });
});
