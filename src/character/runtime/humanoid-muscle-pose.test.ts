import { describe, expect, it } from "vitest";
import type { HumanoidMuscleLimit } from "../domain/humanoid-avatar";
import type { CharacterQuaternion } from "./pose-math";
import {
  decodeHumanoidMuscleRotation,
  encodeHumanoidMuscleRotation,
  transferHumanoidMuscleRotation,
} from "./humanoid-muscle-pose";

const IDENTITY = [0, 0, 0, 1] as const;

describe("humanoid muscle pose", () => {
  it("round-trips finite canonical rotations through normalized muscles", () => {
    const rotation = axisAngle([0, 1, 0], 0.73);
    const muscles = encodeHumanoidMuscleRotation(rotation)!;
    const reconstructed = decodeHumanoidMuscleRotation(muscles)!;

    expect(muscles[1]).toBeCloseTo(0.73 / Math.PI, 8);
    expect(similarity(rotation, reconstructed)).toBeCloseTo(1, 8);
  });

  it("maps source and target angular limits without carrying skeleton proportions", () => {
    const sourceLimit = symmetricLimit(Math.PI);
    const targetLimit = symmetricLimit(Math.PI / 2);
    const transferred = transferHumanoidMuscleRotation({
      sourceLocalRotation: axisAngle([1, 0, 0], Math.PI / 2),
      sourceReferenceLocalRotation: IDENTITY,
      sourceParentReferenceRotation: IDENTITY,
      targetReferenceLocalRotation: IDENTITY,
      targetParentReferenceRotation: IDENTITY,
      axisAlignment: IDENTITY,
      sourceLimit,
      targetLimit,
    })!;

    expect(transferred.muscles[0]).toBeCloseTo(0.5, 8);
    expect(transferred.muscles.slice(1)).toEqual([0, 0]);
    expect(similarity(transferred.rotation, axisAngle([1, 0, 0], Math.PI / 4)))
      .toBeCloseTo(1, 8);
  });

  it("rejects malformed author limits instead of emitting a corrupt pose", () => {
    expect(encodeHumanoidMuscleRotation(IDENTITY, {
      minimum: [0, -1, -1],
      maximum: [1, 1, 1],
    })).toBeNull();
  });
});

function symmetricLimit(angle: number): HumanoidMuscleLimit {
  return { minimum: [-angle, -angle, -angle], maximum: [angle, angle, angle] };
}

function axisAngle(axis: readonly [number, number, number], angle: number): CharacterQuaternion {
  const half = angle / 2;
  const sine = Math.sin(half);
  return [axis[0] * sine, axis[1] * sine, axis[2] * sine, Math.cos(half)];
}

function similarity(left: CharacterQuaternion, right: CharacterQuaternion): number {
  return Math.abs(left.reduce((sum, component, index) => sum + component * right[index]!, 0));
}
