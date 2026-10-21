import { describe, expect, it } from "vitest";
import { transformControlPolicy } from "./transform-policy";

const defaults = {
  requestedMode: "translate" as const,
  requestedSpace: "world" as const,
  targetKind: "object" as const,
  snapEnabled: false,
  translationSnap: 0.5,
  rotationSnapDegrees: 15,
  scaleSnap: 0.1,
  gizmoSize: 0.7,
};

describe("transform control policy", () => {
  it("applies authoring space, snap increments, and size to normal objects", () => {
    const policy = transformControlPolicy({
      ...defaults,
      requestedMode: "rotate",
      requestedSpace: "local",
      snapEnabled: true,
      gizmoSize: 1.1,
    });
    expect(policy.mode).toBe("rotate");
    expect(policy.space).toBe("local");
    expect(policy.translationSnap).toBe(0.5);
    expect(policy.rotationSnap).toBeCloseTo(Math.PI / 12, 8);
    expect(policy.scaleSnap).toBe(0.1);
    expect(policy.size).toBe(1.1);
  });

  it("keeps object scaling local and disables snapping when requested", () => {
    const policy = transformControlPolicy({ ...defaults, requestedMode: "scale" });
    expect(policy.space).toBe("local");
    expect(policy.translationSnap).toBeNull();
    expect(policy.rotationSnap).toBeNull();
    expect(policy.scaleSnap).toBeNull();
  });

  it("protects specialized component handles from global space and snapping", () => {
    const policy = transformControlPolicy({
      ...defaults,
      requestedMode: "rotate",
      targetKind: "collider-face",
      snapEnabled: true,
    });
    expect(policy.mode).toBe("translate");
    expect(policy.space).toBe("local");
    expect(policy.translationSnap).toBeNull();
  });

  it("clamps invalid gizmo sizes", () => {
    expect(transformControlPolicy({ ...defaults, gizmoSize: 99 }).size).toBe(1.4);
    expect(transformControlPolicy({ ...defaults, gizmoSize: Number.NaN }).size).toBe(0.7);
  });

  it("bounds corrupted or extreme snap increments", () => {
    const policy = transformControlPolicy({
      ...defaults,
      snapEnabled: true,
      translationSnap: 999,
      rotationSnapDegrees: 360,
      scaleSnap: Number.NaN,
    });
    expect(policy.translationSnap).toBe(100);
    expect(policy.rotationSnap).toBeCloseTo(Math.PI, 8);
    expect(policy.scaleSnap).toBe(0.1);
  });
});
