import { describe, expect, it } from "vitest";
import {
  createShadowCascadeUpdatePlanner,
  type ShadowCascadeUpdateInput,
  type ShadowCascadeUpdatePlan,
} from "./shadow-cascade-update-planner";
import type { ShadowCascadeTier } from "./shadow-cascade-splits";
import {
  dynamicCasterGeneration,
  shadowCameraGeneration,
  shadowCameraPoseGeneration,
  shadowExtentGeneration,
  shadowLightGeneration,
  staticCasterGeneration,
  type ShadowGenerationSnapshot,
} from "./shadow-generations";

type GenerationValues = Readonly<{
  camera?: number;
  cameraPose?: number;
  light?: number;
  extent?: number;
  staticCasters?: number;
  dynamicCasters?: number;
}>;

const camera = Object.freeze({ near: 0.1, far: 1_000, maxShadowDistance: 120 });
const origin = Object.freeze({ x: 0, y: 0, z: 0 });

describe("shadow cascade update planner", () => {
  it("returns zero updates for a stable frame", () => {
    const planner = createShadowCascadeUpdatePlanner();
    const input = frame();
    const initial = planner.plan(input);
    const stable = planner.plan(input);

    expect(initial.counters).toMatchObject({ cascadesUpdated: 3, cascadesReused: 0 });
    expect(initial.cascades.every(({ reasons }) => reasons[0] === "initial")).toBe(true);
    expect(stable.counters).toMatchObject({ cascadesUpdated: 0, cascadesReused: 3 });
    expect(stable.cascades.every(({ update, reasons }) => !update && reasons.length === 0)).toBe(true);
    expect(stable.totals).toMatchObject({ plans: 2, cascadesUpdated: 3, cascadesReused: 3 });
  });

  it("invalidates near dynamic shadows on every changed pose and transform generation", () => {
    const planner = createShadowCascadeUpdatePlanner();
    planner.plan(frame());

    for (let generation = 1; generation <= 3; generation += 1) {
      const plan = planner.plan(frame({ cameraPose: generation, dynamicCasters: generation }));
      expect(cascade(plan, "near")).toMatchObject({
        update: true,
        reasons: ["camera-pose-generation", "dynamic-caster-generation"],
      });
      expect(cascade(plan, "mid").reasons).toEqual(["dynamic-caster-generation"]);
      expect(cascade(plan, "far")).toMatchObject({ update: false, reasons: [] });
      expect(plan.counters.cascadesUpdated).toBe(2);
    }
  });

  it("reuses the far static cache across dynamic caster churn", () => {
    const planner = createShadowCascadeUpdatePlanner();
    const initial = planner.plan(frame());
    const midCell = cascade(initial, "mid").policy.cameraCellWorldSize!;
    const farCell = cascade(initial, "far").policy.cameraCellWorldSize!;
    const position = { x: Math.min(midCell, farCell) * 0.49, y: 0, z: 0 };

    const moved = planner.plan(frame(
      { cameraPose: 1, dynamicCasters: 1 },
      position,
    ));

    expect(cascade(moved, "near").update).toBe(true);
    expect(cascade(moved, "mid").update).toBe(true);
    expect(cascade(moved, "far")).toMatchObject({ update: false, reasons: [] });
    expect(moved.counters.reasons["dynamic-caster-generation"]).toBe(2);
  });

  it("holds snapped cascades stable until the camera crosses their cell", () => {
    const planner = createShadowCascadeUpdatePlanner();
    const initial = planner.plan(frame());
    const midCell = cascade(initial, "mid").policy.cameraCellWorldSize!;
    const farCell = cascade(initial, "far").policy.cameraCellWorldSize!;
    const insideBoth = Math.min(midCell, farCell) * 0.49;

    const inside = planner.plan(frame({ cameraPose: 1 }, { x: insideBoth, y: 0, z: 0 }));
    expect(cascade(inside, "near").reasons).toEqual(["camera-pose-generation"]);
    expect(cascade(inside, "mid").update).toBe(false);
    expect(cascade(inside, "far").update).toBe(false);

    const crossed = planner.plan(frame({ cameraPose: 2 }, { x: farCell * 0.51, y: 0, z: 0 }));
    expect(cascade(crossed, "far").reasons).toEqual(["snapped-camera-cell"]);
    expect(crossed.counters.reasons["snapped-camera-cell"]).toBeGreaterThanOrEqual(1);
  });

  it("invalidates exactly the cascades relevant to generation changes", () => {
    const planner = createShadowCascadeUpdatePlanner();
    planner.plan(frame());

    const staticChange = planner.plan(frame({ staticCasters: 1 }));
    expect(staticChange.cascades.every(({ reasons }) => (
      reasons.includes("static-caster-generation")
    ))).toBe(true);

    const lightChange = planner.plan(frame({ staticCasters: 1, light: 1 }));
    expect(lightChange.cascades.every(({ reasons }) => reasons.includes("light-generation"))).toBe(true);

    const extentChange = planner.plan(frame({ staticCasters: 1, light: 1, extent: 1 }));
    expect(extentChange.cascades.every(({ reasons }) => reasons.includes("extent-generation"))).toBe(true);

    const cameraChange = planner.plan(frame({
      staticCasters: 1,
      light: 1,
      extent: 1,
      camera: 1,
    }));
    expect(cameraChange.cascades.every(({ reasons }) => reasons.includes("camera-generation"))).toBe(true);
  });

  it("detects a camera-range change even if its owner forgot to advance generation", () => {
    const planner = createShadowCascadeUpdatePlanner();
    planner.plan(frame());
    const changed = planner.plan({
      ...frame(),
      camera: { ...camera, maxShadowDistance: 160 },
    });

    expect(changed.cascades.every(({ reasons }) => reasons.includes("camera-range"))).toBe(true);
  });

  it("reuses immutable cascade policies until the camera range changes", () => {
    const planner = createShadowCascadeUpdatePlanner();
    const initial = planner.plan(frame());
    const policies = initial.cascades.map(({ policy }) => policy);
    const moved = planner.plan(frame({ cameraPose: 1 }, { x: 0.01, y: 0, z: 0 }));

    expect(moved.cascades.map(({ policy }) => policy)).toEqual(policies);
    moved.cascades.forEach(({ policy }, index) => {
      expect(policy).toBe(policies[index]);
      expect(Object.isFrozen(policy)).toBe(true);
    });
    expect(Object.isFrozen(moved)).toBe(true);
    expect(Object.isFrozen(moved.cascades)).toBe(true);

    const changed = planner.plan({
      ...frame({ cameraPose: 1 }),
      camera: { ...camera, maxShadowDistance: 160 },
    });
    changed.cascades.forEach(({ policy }, index) => {
      expect(policy).not.toBe(policies[index]);
    });
  });

  it("rejects invalid generation values", () => {
    expect(() => shadowCameraGeneration(-1)).toThrow(RangeError);
    expect(() => dynamicCasterGeneration(1.5)).toThrow(RangeError);
  });
});

function frame(
  values: GenerationValues = {},
  cameraPosition: ShadowCascadeUpdateInput["cameraPosition"] = origin,
): ShadowCascadeUpdateInput {
  return Object.freeze({ camera, cameraPosition, generations: generations(values) });
}

function generations(values: GenerationValues): ShadowGenerationSnapshot {
  return Object.freeze({
    camera: shadowCameraGeneration(values.camera ?? 0),
    cameraPose: shadowCameraPoseGeneration(values.cameraPose ?? 0),
    light: shadowLightGeneration(values.light ?? 0),
    extent: shadowExtentGeneration(values.extent ?? 0),
    staticCasters: staticCasterGeneration(values.staticCasters ?? 0),
    dynamicCasters: dynamicCasterGeneration(values.dynamicCasters ?? 0),
  });
}

function cascade(plan: ShadowCascadeUpdatePlan, tier: ShadowCascadeTier) {
  return plan.cascades.find((candidate) => candidate.tier === tier)!;
}
