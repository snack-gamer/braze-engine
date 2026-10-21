import { describe, expect, it } from "vitest";
import {
  createShadowCascadePolicies,
  snapShadowCameraCell,
} from "./shadow-cascade-policy";
import { calculateShadowCascadeSplits } from "./shadow-cascade-splits";

describe("shadow cascade splits and policy", () => {
  it("blends logarithmic and practical splits and clamps to shadow distance", () => {
    const splits = calculateShadowCascadeSplits({
      near: 1,
      far: 1_000,
      maxShadowDistance: 100,
    }, 0.5);

    expect(splits.map(({ tier }) => tier)).toEqual(["near", "mid", "far"]);
    expect(splits[0].near).toBe(1);
    expect(splits[0].far).toBeCloseTo(19.3207944168);
    expect(splits[1].near).toBeCloseTo(splits[0].far);
    expect(splits[1].far).toBeCloseTo(44.2721734502);
    expect(splits[2]).toMatchObject({ far: 100 });
    expect(Object.isFrozen(splits)).toBe(true);
  });

  it("assigns decreasing map sizes and increasing screen-error budgets", () => {
    const policies = createShadowCascadePolicies(calculateShadowCascadeSplits({
      near: 0.1,
      far: 1_000,
      maxShadowDistance: 120,
    }));

    expect(policies.map((policy) => ({
      tier: policy.tier,
      mapSize: policy.mapSize,
      error: policy.maximumScreenErrorPixels,
      scope: policy.casterScope,
      tracking: policy.cameraTracking,
    }))).toEqual([
      {
        tier: "near",
        mapSize: 2048,
        error: 0.5,
        scope: "static-and-dynamic",
        tracking: "pose-generation",
      },
      {
        tier: "mid",
        mapSize: 1024,
        error: 1,
        scope: "static-and-dynamic",
        tracking: "snapped-cell",
      },
      {
        tier: "far",
        mapSize: 512,
        error: 2,
        scope: "static-only",
        tracking: "snapped-cell",
      },
    ]);
    expect(policies[0].cameraCellWorldSize).toBeNull();
    expect(policies[2].cameraCellWorldSize).toBeGreaterThan(policies[1].cameraCellWorldSize!);
  });

  it("keeps positions stable inside a snapped camera cell", () => {
    expect(snapShadowCameraCell({ x: 0, y: 0, z: 0 }, 2)).toEqual({ x: 0, y: 0, z: 0 });
    expect(snapShadowCameraCell({ x: 0.98, y: -0.98, z: 0 }, 2))
      .toEqual({ x: 0, y: 0, z: 0 });
    expect(snapShadowCameraCell({ x: 1.02, y: 0, z: 0 }, 2))
      .toEqual({ x: 1, y: 0, z: 0 });
  });
});
