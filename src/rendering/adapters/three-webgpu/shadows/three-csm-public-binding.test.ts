import { DirectionalLight, PerspectiveCamera } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  dynamicCasterGeneration,
  shadowCameraGeneration,
  shadowCameraPoseGeneration,
  shadowExtentGeneration,
  shadowLightGeneration,
  staticCasterGeneration,
} from "../../../runtime/shadows/shadow-generations";
import {
  createThreeCsmShadowBinding,
  type ThreeCsmPublicSurface,
} from "./three-csm-public-binding";
import { createThreeShadowPlanAdapter } from "./three-shadow-plan-adapter";

describe("Three CSM public binding", () => {
  it("applies map sizes, custom breaks, and explicit update flags", () => {
    const shadows = [
      new DirectionalLight().shadow,
      new DirectionalLight().shadow,
      new DirectionalLight().shadow,
    ];
    let appliedBreaks: number[] = [];
    const csm: ThreeCsmPublicSurface = {
      camera: new PerspectiveCamera(),
      customSplitsCallback: () => undefined,
      lights: shadows.map((shadow) => ({ shadow })),
      maxFar: 1_000,
      mode: "practical",
      updateFrustums: vi.fn(() => {
        appliedBreaks = [];
        csm.customSplitsCallback(3, 0.1, csm.maxFar, appliedBreaks);
      }),
    };
    const planner = createThreeShadowPlanAdapter();
    const binding = createThreeCsmShadowBinding(csm, { staticCasters: 0b10, dynamicCasters: 0b100 });
    const initial = planner.plan(input());

    expect(binding.apply(initial)).toEqual({
      status: "applied",
      requestedUpdates: 3,
      reusedCascades: 0,
      frustumsUpdated: true,
    });
    expect(csm.mode).toBe("custom");
    expect(csm.maxFar).toBe(120);
    expect(appliedBreaks).toEqual(initial.normalizedBreaks);
    const stableSplitCallback = csm.customSplitsCallback;
    expect(shadows.map(({ mapSize }) => mapSize.width)).toEqual([2048, 1024, 512]);
    expect(shadows.map(({ camera }) => camera.layers.mask)).toEqual([0b110, 0b110, 0b10]);
    expect(shadows.every(({ autoUpdate, needsUpdate }) => !autoUpdate && needsUpdate)).toBe(true);

    shadows.forEach((shadow) => { shadow.needsUpdate = false; });
    const stable = planner.plan(input());
    const stableResult = binding.apply(stable);
    expect(stableResult).toMatchObject({ requestedUpdates: 0, frustumsUpdated: false });
    expect(csm.customSplitsCallback).toBe(stableSplitCallback);
    expect(csm.updateFrustums).toHaveBeenCalledOnce();
    expect(shadows.every(({ needsUpdate }) => !needsUpdate)).toBe(true);

    shadows[2].needsUpdate = true;
    const dynamic = planner.plan(input(1));
    expect(binding.apply(dynamic)).toMatchObject({ requestedUpdates: 2, reusedCascades: 1 });
    expect(csm.customSplitsCallback).toBe(stableSplitCallback);
    expect(shadows.map(({ needsUpdate }) => needsUpdate)).toEqual([true, true, true]);
  });

  it("waits without mutation and refreshes once Three finishes private initialization", () => {
    const csm: ThreeCsmPublicSurface = {
      camera: null,
      customSplitsCallback: () => undefined,
      lights: [],
      maxFar: 1_000,
      mode: "practical",
      updateFrustums: vi.fn(),
    };
    const planner = createThreeShadowPlanAdapter();
    const binding = createThreeCsmShadowBinding(csm, { staticCasters: 0b10, dynamicCasters: 0b100 });

    expect(binding.apply(planner.plan(input()))).toMatchObject({
      status: "awaiting-three-initialization",
      requestedUpdates: 0,
      frustumsUpdated: false,
    });
    expect(csm.updateFrustums).not.toHaveBeenCalled();

    csm.camera = new PerspectiveCamera();
    csm.lights = [
      { shadow: new DirectionalLight().shadow },
      { shadow: new DirectionalLight().shadow },
      { shadow: new DirectionalLight().shadow },
    ];
    const stableRuntimeFrame = planner.plan(input());
    expect(stableRuntimeFrame.updateFrustums).toBe(false);
    expect(binding.apply(stableRuntimeFrame)).toMatchObject({
      status: "applied",
      frustumsUpdated: true,
    });
    expect(csm.updateFrustums).toHaveBeenCalledOnce();
  });

  it("rejects layer masks that cannot enforce static-only far rendering", () => {
    const csm: ThreeCsmPublicSurface = {
      camera: null,
      customSplitsCallback: () => undefined,
      lights: [],
      maxFar: 1_000,
      mode: "practical",
      updateFrustums: vi.fn(),
    };

    expect(() => createThreeCsmShadowBinding(csm, {
      staticCasters: 0b10,
      dynamicCasters: 0b10,
    })).toThrow(/must not overlap/);
    expect(() => createThreeCsmShadowBinding(csm, {
      staticCasters: 0b1,
      dynamicCasters: 0b10,
    })).toThrow(/dedicated non-default/);
    expect(() => createThreeCsmShadowBinding(csm, {
      staticCasters: 0b10,
      dynamicCasters: 0b1,
    })).toThrow(/dedicated non-default/);
  });
});

function input(dynamicCasters = 0) {
  return Object.freeze({
    camera: Object.freeze({ near: 0.1, far: 1_000, maxShadowDistance: 120 }),
    cameraPosition: Object.freeze({ x: 0, y: 0, z: 0 }),
    generations: Object.freeze({
      camera: shadowCameraGeneration(0),
      cameraPose: shadowCameraPoseGeneration(dynamicCasters),
      light: shadowLightGeneration(0),
      extent: shadowExtentGeneration(0),
      staticCasters: staticCasterGeneration(0),
      dynamicCasters: dynamicCasterGeneration(dynamicCasters),
    }),
  });
}
