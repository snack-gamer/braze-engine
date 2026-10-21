import { describe, expect, it } from "vitest";
import type { CompiledRenderGraph } from "../../runtime/render-graph-definition";
import type {
  ViewportRenderFeatures,
  ViewportRenderPassPayload,
  ViewportResourceDescriptor,
} from "../../runtime/viewport-render-graph";
import {
  compileViewportRenderGraphPackage,
  type ViewportRenderGraphPackage,
} from "../../runtime/viewport-graph/viewport-graph-package";
import { viewportTopologySignature } from "../../runtime/viewport-graph/viewport-topology-signature";
import {
  compileThreeViewportExecutionPlan,
  ThreeViewportExecutionPlanError,
} from "./three-viewport-execution-plan";

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

type ViewportGraph = CompiledRenderGraph<ViewportResourceDescriptor, ViewportRenderPassPayload>;

describe("Three viewport execution plan", () => {
  it("derives every physical branch from the compiled pass topology", () => {
    const features = [
      "ambientOcclusion",
      "bloom",
      "clouds",
      "godrays",
      "particleBasePassCompatibility",
      "screenSpaceReflections",
      "shadows",
    ] as const;

    for (let mask = 0; mask < 2 ** features.length; mask += 1) {
      const enabled = { ...disabled };
      features.forEach((feature, index) => { enabled[feature] = Boolean(mask & (1 << index)); });
      const plan = compileThreeViewportExecutionPlan(compileViewportRenderGraphPackage(enabled));
      expect(plan.ambientOcclusion !== null).toBe(enabled.ambientOcclusion);
      expect(plan.bloomActive).toBe(enabled.bloom);
      expect(plan.cloudsActive).toBe(enabled.clouds);
      expect(plan.godraysActive).toBe(enabled.godrays);
      expect(plan.particleBasePassCompatibilityActive)
        .toBe(enabled.particleBasePassCompatibility);
      expect(plan.screenSpaceReflectionsActive).toBe(enabled.screenSpaceReflections);
      expect(plan.shadowsActive).toBe(enabled.shadows);
    }
  });

  it("routes AO to reconstructed depth normals unless the graph declares the SSR MRT normal", () => {
    const reconstructed = compileThreeViewportExecutionPlan(compileViewportRenderGraphPackage({
      ...disabled,
      ambientOcclusion: true,
    }));
    const mrt = compileThreeViewportExecutionPlan(compileViewportRenderGraphPackage({
      ...disabled,
      ambientOcclusion: true,
      screenSpaceReflections: true,
    }));

    expect(reconstructed).toMatchObject({
      scenePassMode: "offscreen-color-depth",
      ambientOcclusion: { normalSource: "reconstructed-from-depth" },
    });
    expect(mrt).toMatchObject({
      scenePassMode: "offscreen-material-mrt",
      ambientOcclusion: { normalSource: "scene-normal" },
    });
  });

  it("rejects declared features that disagree with compiled passes", () => {
    const valid = compileViewportRenderGraphPackage({ ...disabled, ambientOcclusion: true });
    const malformed = { ...valid, features: disabled };

    expectPlanError(malformed, "feature-pass-mismatch");
  });

  it("rejects changed pass resources even when the package signature is refreshed", () => {
    const valid = compileViewportRenderGraphPackage({
      ...disabled,
      ambientOcclusion: true,
      screenSpaceReflections: true,
    });
    const graph = graphWithPasses(valid, valid.graph.passes.map((pass) =>
      pass.payload?.kind === "ambient-occlusion"
        ? { ...pass, reads: pass.reads.filter((resource) => resource !== "scene-normal") }
        : pass));

    expectPlanError(packageWithGraph(valid, graph), "noncanonical-topology");
  });

  it("rejects logical pass order drift", () => {
    const valid = compileViewportRenderGraphPackage({ ...disabled, ambientOcclusion: true });
    const [base, ambientOcclusion, terminal] = valid.graph.passes;
    const graph = graphWithPasses(valid, [ambientOcclusion, base, terminal]);

    expectPlanError(packageWithGraph(valid, graph), "noncanonical-topology");
  });

  it("rejects a post chain without its compiled presentation terminal", () => {
    const valid = compileViewportRenderGraphPackage({ ...disabled, ambientOcclusion: true });
    const graph = graphWithPasses(valid, valid.graph.passes.slice(0, -1));

    expectPlanError(packageWithGraph(valid, graph), "invalid-terminal");
  });

  it("fails explicitly for logical overlay passes unsupported by the pinned adapter", () => {
    const unsupported = compileViewportRenderGraphPackage({ ...disabled, overlays: true });
    expectPlanError(unsupported, "unsupported-pass");
  });
});

function graphWithPasses(
  graphPackage: ViewportRenderGraphPackage,
  passes: ViewportGraph["passes"],
): ViewportGraph {
  return { ...graphPackage.graph, passes };
}

function packageWithGraph(
  graphPackage: ViewportRenderGraphPackage,
  graph: ViewportGraph,
): ViewportRenderGraphPackage {
  return {
    ...graphPackage,
    graph,
    topologySignature: viewportTopologySignature(graph),
  };
}

function expectPlanError(
  graphPackage: ViewportRenderGraphPackage,
  code: ThreeViewportExecutionPlanError["code"],
): void {
  expect(() => compileThreeViewportExecutionPlan(graphPackage)).toThrowError(
    expect.objectContaining({ code }),
  );
}
