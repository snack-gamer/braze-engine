import { describe, expect, it } from "vitest";
import { compileRenderGraph } from "./render-graph-compiler";
import { buildViewportRenderGraph, type ViewportRenderFeatures } from "./viewport-render-graph";

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

describe("viewport render graph", () => {
  it("renders the base scene directly to the presentation surface", () => {
    const graph = compileRenderGraph(buildViewportRenderGraph(disabled));

    expect(graph.passes.map((pass) => pass.id)).toEqual(["base-scene"]);
    expect(graph.resources.map((resource) => resource.id)).toEqual([
      "presentation-surface",
      "view",
      "world",
    ]);
  });

  it("reconstructs AO normals from depth and creates MRT data only for SSR", () => {
    const ao = compileRenderGraph(buildViewportRenderGraph({ ...disabled, ambientOcclusion: true }));
    const ssr = compileRenderGraph(buildViewportRenderGraph({ ...disabled, screenSpaceReflections: true }));

    expect(ao.resources.map((resource) => resource.id)).not.toContain("scene-normal");
    expect(ao.resources.map((resource) => resource.id)).not.toContain("scene-metalness");
    expect(ao.resources.map((resource) => resource.id)).not.toContain("scene-roughness");
    expect(ssr.resources.map((resource) => resource.id)).toEqual(expect.arrayContaining([
      "scene-normal",
      "scene-metalness",
      "scene-roughness",
    ]));
  });

  it("does not model unimplemented velocity or atmosphere history", () => {
    const graph = compileRenderGraph(buildViewportRenderGraph({
      ...disabled,
      clouds: true,
      godrays: true,
    }));
    const resourceIds = graph.resources.map((resource) => resource.id);

    expect(resourceIds).not.toContain("scene-velocity");
    expect(resourceIds.some((id) => id.includes("history"))).toBe(false);
    expect(graph.passes.some(({ payload }) => payload?.kind.includes("temporal"))).toBe(false);
  });

  it("keeps cloud and godray contributions at their targeted linear scales", () => {
    const graph = compileRenderGraph(buildViewportRenderGraph({
      ...disabled,
      clouds: true,
      godrays: true,
    }));
    const extentFor = (id: string) => graph.resources
      .find((resource) => resource.id === id)?.descriptor?.extent;

    expect(extentFor("clouds")).toBe("quarter");
    expect(extentFor("godrays-source-mask")).toBe("half");
    expect(extentFor("godrays")).toBe("half");
    expect(graph.resources.find(({ id }) => id === "godrays-source-mask")?.descriptor?.format)
      .toBe("mask");
    expect(graph.resources.find(({ id }) => id === "godrays")?.descriptor?.format)
      .toBe("scalar");
    expect(graph.passes.filter(({ payload }) => payload?.kind === "godrays-source-mask"))
      .toHaveLength(1);
    expect(graph.passes.filter(({ payload }) => payload?.kind === "godrays")).toHaveLength(1);
  });

  it("marks particles as base-pass compatibility without inventing a graph-owned pass", () => {
    const graph = compileRenderGraph(buildViewportRenderGraph({
      ...disabled,
      overlays: true,
      particleBasePassCompatibility: true,
    }));

    expect(graph.passes.map((pass) => pass.payload?.kind)).toEqual([
      "base-scene",
      "overlays",
      "present",
    ]);
    expect(graph.passes[0]?.payload?.basePassCompatibility).toEqual(["particles"]);
    expect(graph.resources.map(({ id }) => id)).not.toContain("color-after-particles");
  });

  it("prunes no resources from a fully connected feature graph", () => {
    const graph = compileRenderGraph(buildViewportRenderGraph({
      ambientOcclusion: true,
      bloom: true,
      clouds: true,
      godrays: true,
      overlays: true,
      particleBasePassCompatibility: true,
      screenSpaceReflections: true,
      shadows: true,
    }));

    expect(graph.prunedPasses).toEqual([]);
    expect(graph.resources.map((resource) => resource.id)).toEqual(expect.arrayContaining([
      "ambient-occlusion",
      "bloom",
      "clouds",
      "godrays",
      "scene-metalness",
      "scene-normal",
      "scene-roughness",
      "shadow-atlas",
    ]));
  });
});
