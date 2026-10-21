import { describe, expect, it } from "vitest";
import type { ViewportRenderFeatures } from "../../runtime/viewport-render-graph";
import { compileViewportRenderGraphPackage } from "../../runtime/viewport-graph/viewport-graph-package";
import { createThreeR184ViewportPhysicalManifest } from "./three-r184-viewport-physical-manifest";
import { compileThreeViewportExecutionPlan } from "./three-viewport-execution-plan";

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

describe("Three r184 viewport physical manifest", () => {
  it("accounts for every live post/shadow feature combination", () => {
    const features = [
      "ambientOcclusion",
      "bloom",
      "clouds",
      "godrays",
      "screenSpaceReflections",
      "shadows",
    ] as const;
    for (let mask = 0; mask < 2 ** features.length; mask += 1) {
      const enabled = { ...disabled };
      features.forEach((feature, index) => { enabled[feature] = Boolean(mask & (1 << index)); });
      const manifest = build(enabled);
      const post = enabled.ambientOcclusion || enabled.bloom || enabled.clouds
        || enabled.godrays || enabled.screenSpaceReflections;
      const expectedTargets = (post ? 1 : 0)
        + Number(enabled.ambientOcclusion)
        + (enabled.screenSpaceReflections ? 2 : 0)
        + (enabled.bloom ? 11 : 0)
        + Number(enabled.clouds)
        + (enabled.godrays ? 2 : 0)
        + (enabled.shadows ? 3 : 0);
      const expectedTextures = (post ? 2 + (enabled.screenSpaceReflections ? 3 : 0) : 0)
        + Number(enabled.ambientOcclusion)
        + (enabled.screenSpaceReflections ? 2 : 0)
        + (enabled.bloom ? 11 : 0)
        + Number(enabled.clouds)
        + (enabled.godrays ? 2 : 0)
        + (enabled.shadows ? 6 : 0);
      const expectedExecutions = 1 + Number(post)
        + Number(enabled.ambientOcclusion)
        + (enabled.screenSpaceReflections ? 6 : 0)
        + (enabled.bloom ? 12 : 0)
        + Number(enabled.clouds)
        + (enabled.godrays ? 2 : 0)
        + (enabled.shadows ? 3 : 0);
      expect([
        manifest.renderTargetCount,
        manifest.textureAllocationCount,
        manifest.maximumExecutionCount,
      ]).toEqual([expectedTargets, expectedTextures, expectedExecutions]);
      expect(new Set(manifest.targets.map(({ id }) => id)).size).toBe(manifest.targets.length);
      expect(new Set(manifest.executions.map(({ id }) => id)).size).toBe(manifest.executions.length);
    }
  });

  it.each([
    ["ambientOcclusion", 2, 3, 3],
    ["screenSpaceReflections", 3, 7, 8],
    ["bloom", 12, 13, 14],
    ["clouds", 2, 3, 3],
    ["godrays", 3, 4, 4],
    ["shadows", 3, 6, 4],
  ] as const)("expands %s into exact adapter allocations and executions", (
    feature,
    renderTargetCount,
    textureAllocationCount,
    maximumExecutionCount,
  ) => {
    const manifest = build({ ...disabled, [feature]: true });
    expect(manifest).toMatchObject({
      renderTargetCount,
      textureAllocationCount,
      maximumExecutionCount,
    });
  });

  it("enumerates the pinned all-post topology instead of treating logical operators as passes", () => {
    const manifest = build({
      ...disabled,
      ambientOcclusion: true,
      bloom: true,
      clouds: true,
      godrays: true,
      screenSpaceReflections: true,
    });

    expect(manifest).toMatchObject({
      threeRevision: "184",
      renderTargetCount: 18,
      textureAllocationCount: 22,
      maximumExecutionCount: 24,
    });
    expect(manifest.targets.find(({ id }) => id === "scene-pass")?.attachments.map(({ name }) => name))
      .toEqual(["output", "depth", "normal", "metalness", "roughness"]);
    expect(manifest.targets.find(({ id }) => id === "ssr-blur-mips")?.attachments[0]?.mipLevels)
      .toBe(5);
    expect(manifest.executions[manifest.executions.length - 1]?.id).toBe("composite-present");
    expect(manifest.estimatedAttachmentPayloadBytes(3840, 2160) / 1024 / 1024)
      .toBeCloseTo(391.49, 1);
  });

  it("keeps shadows as three persistent invalidated targets beside direct rendering", () => {
    const manifest = build({ ...disabled, shadows: true });
    expect(manifest.targets.map(({ extent }) => extent)).toEqual([
      "shadow-near", "shadow-mid", "shadow-far",
    ]);
    expect(manifest.executions.map(({ cadence }) => cadence)).toEqual([
      "invalidated-shadow-cascade",
      "invalidated-shadow-cascade",
      "invalidated-shadow-cascade",
      "every-render",
    ]);
    expect(manifest.estimatedAttachmentPayloadBytes(3840, 2160) / 1024 / 1024).toBe(42);
  });

  it("adds the three shadow targets to the maximum post topology without hidden work", () => {
    const manifest = build({
      ...disabled,
      ambientOcclusion: true,
      bloom: true,
      clouds: true,
      godrays: true,
      screenSpaceReflections: true,
      shadows: true,
    });
    expect(manifest).toMatchObject({
      renderTargetCount: 21,
      textureAllocationCount: 28,
      maximumExecutionCount: 27,
    });
    expect(manifest.estimatedAttachmentPayloadBytes(3840, 2160) / 1024 / 1024)
      .toBeCloseTo(433.49, 1);
  });
});

function build(features: ViewportRenderFeatures) {
  const plan = compileThreeViewportExecutionPlan(compileViewportRenderGraphPackage(features));
  return createThreeR184ViewportPhysicalManifest(plan, {
    depthFormat: "depth32float",
  });
}
