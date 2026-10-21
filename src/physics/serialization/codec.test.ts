import { describe, expect, it } from "vitest";
import {
  parsePhysicsComponents,
  parsePhysicsWorldSettings,
  serializeColliders,
  serializePhysicsWorldSettings,
  serializeRigidbody,
} from "./codec";

describe("physics serialization", () => {
  it("round-trips engine-facing component payloads", () => {
    const rigidbody = {
      enabled: true,
      bodyType: "dynamic" as const,
      massMode: "manual" as const,
      mass: 3,
      density: 2,
      useGravity: false,
      linearDamping: 0.2,
      angularDamping: 0.4,
      interpolation: "none" as const,
    };
    const collider = {
      id: "body-collider-1",
      enabled: true,
      shape: "capsule" as const,
      axis: "x" as const,
      center: [0, 0.5, 0] as [number, number, number],
      size: [1, 2, 3] as [number, number, number],
      radius: 0.4,
      length: 1.2,
      majorRadius: 0.8,
      minorRadius: 0.2,
      friction: 0.25,
      showGizmo: false,
    };
    const parsed = parsePhysicsComponents({
      rigidbody: serializeRigidbody(rigidbody),
      colliders: serializeColliders([collider]),
    }, { id: "body", primitive: "cube" });
    expect(parsed).toEqual({ rigidbody, colliders: [collider] });
  });

  it("normalizes vector world settings and accepts legacy scalar gravity", () => {
    const parsed = parsePhysicsWorldSettings({
      gravity: [1, -9.81, 2],
      fixed_timestep: 1 / 120,
      max_substeps: 7,
    });
    expect(parsed.gravity).toEqual([1, -9.81, 2]);
    expect(serializePhysicsWorldSettings(parsed)).toMatchObject({
      gravity: [1, -9.81, 2],
      max_substeps: 7,
      version: 1,
    });
    expect(parsePhysicsWorldSettings(serializePhysicsWorldSettings(parsed))).toEqual(parsed);
    expect(parsePhysicsWorldSettings({ gravity: "-9.81" }).gravity).toEqual([0, -9.81, 0]);
  });
});
