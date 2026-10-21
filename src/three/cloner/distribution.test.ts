import { describe, expect, it } from "vitest";
import { defaultClonerSettings } from "../../lib/cloner";
import {
  cloneCount,
  distributionTransform,
  radialDecode,
} from "./distribution";
import {
  localDistributionBounds,
  neighborsFor,
  sourceIndexFor,
} from "./distribution-planning";

describe("cloner distribution planning", () => {
  it("keeps grid transforms centered and bounded with the authored spacing", () => {
    const cloner = {
      ...defaultClonerSettings,
      mode: "grid" as const,
      gridCount: [2, 2, 1] as [number, number, number],
      gridSpacing: [2, 4, 6] as [number, number, number],
      gridCenter: true,
    };
    expect(cloneCount(cloner)).toBe(4);
    expect(distributionTransform(cloner, 0, 4).position).toEqual([-1, -2, 0]);
    expect(distributionTransform(cloner, 3, 4).position).toEqual([1, 2, 0]);
    expect(localDistributionBounds(cloner, 4, [])).toEqual({
      min: [-1.0005, -2.0005, -0.0005],
      max: [1.0005, 2.0005, 0.0005],
    });
  });

  it("decodes stepped radial rings and preserves radial neighbor topology", () => {
    const cloner = {
      ...defaultClonerSettings,
      mode: "radial" as const,
      count: 3,
      radialRings: 2,
      radialCountStep: 1,
      arc: 360,
    };
    expect(cloneCount(cloner)).toBe(7);
    expect(radialDecode(cloner, 4)).toEqual({ ring: 1, segment: 1, segments: 4, start: 3 });
    expect(neighborsFor(cloner, 4, 7)).toEqual([3, 5, 1]);
  });

  it("keeps sequential sources stable and hashes only random source groups", () => {
    const sequential = { ...defaultClonerSettings, sourceMode: "iterate" as const, seed: 17 };
    expect([0, 1, 2, 3].map((index) => sourceIndexFor(sequential, index, 3))).toEqual([0, 1, 2, 0]);
    const random = { ...sequential, sourceMode: "random" as const };
    const firstGroup = [0, 1, 2].map((index) => sourceIndexFor(random, index, 3));
    expect(new Set(firstGroup)).toEqual(new Set([0, 1, 2]));
    expect(sourceIndexFor(random, 3, 3)).toBe(sourceIndexFor(random, 3, 3));
  });
});
