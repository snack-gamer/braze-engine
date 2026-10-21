import { describe, expect, it } from "vitest";
import { createRuntimeModifierPlan, runtimeModifierPresence } from "./runtime";
import type { SceneObject } from "../../types";

const object = (patch: Partial<SceneObject> = {}): SceneObject => ({
  id: "object",
  name: "Object",
  primitive: "cube",
  visible: true,
  locked: false,
  solo: false,
  color: "#ffffff",
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  ...patch,
});

describe("runtime modifier presence", () => {
  it("keeps ordinary scenes off the per-frame modifier path", () => {
    expect(runtimeModifierPresence([object()])).toEqual({ buoyancy: false, motionPulse: false });
  });

  it("detects enabled buoyancy without enabling motion-pulse work", () => {
    expect(runtimeModifierPresence([object({
      modifiers: [{
        id: "buoyancy",
        name: "Buoyancy",
        type: "buoyancy",
        enabled: true,
        waterObjectId: undefined,
        damping: 0.5,
        followTilt: true,
        tiltStrength: 1,
        maxTiltDeg: 25,
        verticalOffset: 0,
        showPinGizmos: true,
        pinGizmoScale: 1,
        pins: [],
      }],
    })])).toEqual({ buoyancy: true, motionPulse: false });
  });

  it("indexes only active modifier owners for the per-frame path", () => {
    const ordinary = Array.from({ length: 20_000 }, (_, index) => object({ id: `ordinary-${index}` }));
    const buoyant = object({
      id: "buoyant",
      modifiers: [{
        id: "buoyancy",
        name: "Buoyancy",
        type: "buoyancy",
        enabled: true,
        damping: 0.5,
        followTilt: false,
        tiltStrength: 0,
        maxTiltDeg: 0,
        verticalOffset: 0,
        showPinGizmos: false,
        pinGizmoScale: 1,
        pins: [],
      }],
    });

    const plan = createRuntimeModifierPlan([...ordinary, buoyant]);
    expect(plan.objectsById.size).toBe(20_001);
    expect(plan.buoyancyOwners.map((entry) => entry.object.id)).toEqual(["buoyant"]);
    expect(plan.motionPulseOwners).toEqual([]);
  });
});
