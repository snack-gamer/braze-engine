import { describe, expect, it } from "vitest";
import type { ViewportRenderFeatures } from "../viewport-render-graph";
import { createViewportRenderGraphPackageCache } from "./viewport-graph-cache";
import { compileViewportRenderGraphPackage } from "./viewport-graph-package";

const disabled: ViewportRenderFeatures = {
  ambientOcclusion: false,
  bloom: false,
  clouds: false,
  godrays: false,
  overlays: false,
  particleBasePassCompatibility: false,
  screenSpaceReflections: false,
  shadows: false,
};

const primaryTopologies: readonly Readonly<{
  feature: keyof ViewportRenderFeatures;
  passes: readonly string[];
  resources: readonly string[];
}>[] = [
  {
    feature: "ambientOcclusion",
    passes: ["base-scene", "ambient-occlusion", "composite-present"],
    resources: [
      "ambient-occlusion", "presentation-surface", "scene-color",
      "scene-depth", "view", "world",
    ],
  },
  {
    feature: "bloom",
    passes: ["base-scene", "bloom", "composite-present"],
    resources: [
      "bloom", "presentation-surface", "scene-color", "scene-depth",
      "view", "world",
    ],
  },
  {
    feature: "clouds",
    passes: ["base-scene", "clouds", "composite-present"],
    resources: [
      "clouds", "presentation-surface", "scene-color", "scene-depth",
      "view", "world",
    ],
  },
  {
    feature: "godrays",
    passes: ["base-scene", "godrays-source-mask", "godrays", "composite-present"],
    resources: [
      "godrays", "godrays-source-mask", "presentation-surface",
      "scene-color", "scene-depth", "view", "world",
    ],
  },
  {
    feature: "overlays",
    passes: ["base-scene", "overlays", "present"],
    resources: [
      "color-after-overlays", "presentation-surface", "scene-color", "scene-depth", "view", "world",
    ],
  },
  {
    feature: "particleBasePassCompatibility",
    passes: ["base-scene"],
    resources: [
      "presentation-surface", "view", "world",
    ],
  },
  {
    feature: "screenSpaceReflections",
    passes: ["base-scene", "screen-space-reflections", "composite-present"],
    resources: [
      "presentation-surface", "scene-color", "scene-depth", "scene-metalness", "scene-normal",
      "scene-roughness", "screen-space-reflections", "view", "world",
    ],
  },
  {
    feature: "shadows",
    passes: ["shadows", "base-scene"],
    resources: [
      "presentation-surface", "shadow-atlas", "view", "world",
    ],
  },
];

describe("viewport graph package", () => {
  it("reuses packages for identical effective feature sets", () => {
    const cache = createViewportRenderGraphPackageCache();
    const first = cache.get({ ...disabled });
    const second = cache.get({ ...disabled });

    expect(second).toBe(first);
    expect(cache.size).toBe(1);
  });

  it("has exact topology for each independent primary feature", () => {
    for (const expected of primaryTopologies) {
      const graphPackage = compileViewportRenderGraphPackage({
        ...disabled,
        [expected.feature]: true,
      });
      expect(graphPackage.graph.passes.map(({ id }) => id), expected.feature)
        .toEqual(expected.passes);
      expect(graphPackage.graph.resources.map(({ id }) => id), expected.feature)
        .toEqual(expected.resources);
    }
  });

  it("keeps disabled effects at zero resources and passes", () => {
    const graphPackage = compileViewportRenderGraphPackage(disabled);

    expect(graphPackage.graph.passes.map(({ id }) => id)).toEqual(["base-scene"]);
    expect(graphPackage.graph.resources.map(({ id }) => id)).toEqual([
      "presentation-surface", "view", "world",
    ]);
    expect(graphPackage.diagnostics.historyResources).toEqual([]);
  });

  it("packages immutable analysis, allocation, estimates, signatures, and diagnostics", () => {
    const features: ViewportRenderFeatures = {
      ambientOcclusion: true,
      bloom: true,
      clouds: true,
      godrays: true,
      overlays: true,
      particleBasePassCompatibility: true,
      screenSpaceReflections: true,
      shadows: true,
    };
    const first = compileViewportRenderGraphPackage(features);
    const second = compileViewportRenderGraphPackage({ ...features });

    expect(first.topologySignature).toBe(second.topologySignature);
    expect(first.diagnostics).toMatchObject({
      logicalTransientCount: 13,
      logicalAliasSlotCount: 12,
      prunedPasses: [],
      externalResources: ["presentation-surface", "view", "world"],
      historyResources: ["shadow-atlas"],
    });
    expect(first.diagnostics.lines).toContain(
      "Logical transients: 13; compatible alias slots: 12 (analysis only).",
    );
    expect(first.logicalByteEstimateInputs.logicalResources).toHaveLength(first.graph.resources.length);
    expect(first.logicalByteEstimateInputs.logicalAliasSlots)
      .toHaveLength(first.logicalAliasPlan.slots.length);
    expect(first.logicalAliasPlan.allocations.map(({ resourceId }) => resourceId))
      .not.toContain("shadow-atlas");
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.graph.resources)).toBe(true);
    expect(Object.isFrozen(first.graph.resources[0].descriptor)).toBe(true);
    expect(Object.isFrozen(first.lifetimes)).toBe(true);
    expect(Object.isFrozen(first.logicalByteEstimateInputs.logicalAliasSlots)).toBe(true);
    expect(Object.isFrozen(first.diagnostics.lines)).toBe(true);
  });

  it("changes the topology signature when a live feature changes", () => {
    const base = compileViewportRenderGraphPackage(disabled);
    const bloom = compileViewportRenderGraphPackage({ ...disabled, bloom: true });
    const particleCompatibility = compileViewportRenderGraphPackage({
      ...disabled,
      particleBasePassCompatibility: true,
    });

    expect(bloom.topologySignature).not.toBe(base.topologySignature);
    expect(particleCompatibility.topologySignature).not.toBe(base.topologySignature);
    expect(particleCompatibility.graph.passes[0]?.payload?.basePassCompatibility)
      .toEqual(["particles"]);
  });
});
