import { describe, expect, it, vi } from "vitest";
import type { PhysicsBodyBinding } from "../../physics/runtime/pose-binding";
import {
  applyKinematicMotorDelta,
  flushPendingKinematicMotorDeltas,
  initialKinematicObjectPoses,
  resetKinematicMotorSession,
} from "./kinematic-character-motor";

describe("kinematic character motor", () => {
  it("converts an object-local root delta into every compound collider target", () => {
    const bindings = [binding("first", [1, 0, 0]), binding("second", [0, 0, 0])];
    const writeKinematicBodyPose = vi.fn();
    const onChanged = vi.fn();
    const objectPoses = initialKinematicObjectPoses(bindings);

    applyKinematicMotorDelta({
      runtime: { writeKinematicBodyPose },
      bodyBindings: bindings,
      objectPoses,
    }, "hero", {
      translation: [2, 0, 0],
      rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
    }, onChanged);

    expect(objectPoses.get("hero")?.position).toEqual([2, 0, 0]);
    expect(writeKinematicBodyPose).toHaveBeenCalledTimes(2);
    expect(writeKinematicBodyPose).toHaveBeenNthCalledWith(
      1,
      0,
      expectTuple([2, -1, 0]),
      expectTuple([0, 0, Math.SQRT1_2, Math.SQRT1_2]),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("does not create motor ownership for dynamic bodies", () => {
    const dynamic = { ...binding("dynamic", [0, 0, 0]), bodyType: "dynamic" as const };
    expect(initialKinematicObjectPoses([dynamic])).toEqual(new Map());
  });

  it("discards pending root motion and cached sinks at the Play-session boundary", () => {
    const pending = new Map([[
      "hero",
      { translation: [4, 0, 0] as const, rotation: [0, 0, 0, 1] as const },
    ]]);
    const sinks = new Map([[
      "hero",
      { applyRootMotion: vi.fn() },
    ]]);
    const writeKinematicBodyPose = vi.fn();

    resetKinematicMotorSession(pending, sinks);
    flushPendingKinematicMotorDeltas({
      runtime: { writeKinematicBodyPose },
      bodyBindings: [binding("capsule", [0, 0, 0])],
      objectPoses: initialKinematicObjectPoses([binding("capsule", [0, 0, 0])]),
    }, pending, vi.fn());

    expect(pending.size).toBe(0);
    expect(sinks.size).toBe(0);
    expect(writeKinematicBodyPose).not.toHaveBeenCalled();
  });
});

function binding(colliderId: string, offset: [number, number, number]): PhysicsBodyBinding {
  return {
    objectId: "hero",
    colliderId,
    objectLocalOffset: offset,
    objectLocalOrientation: [0, 0, 0, 1],
    writesObjectPose: true,
    interpolation: "none",
    bodyType: "kinematic",
    objectPosition: [0, 0, 0],
    objectOrientation: [0, 0, 0, 1],
  };
}

function expectTuple(expected: readonly number[]) {
  return expect.toSatisfy((actual: readonly number[]) => (
    actual.length === expected.length
    && actual.every((value, index) => Math.abs(value - expected[index]!) < 1.0e-6)
  ));
}
