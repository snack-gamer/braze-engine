import { describe, expect, it } from "vitest";
import type { ActiveViewportPostEffects } from "./viewport-post-effect-state";
import { createThreeViewportGraphTopology } from "./three-viewport-graph-topology";

const empty: ActiveViewportPostEffects = {
  ambientOcclusion: null,
  bloom: null,
  clouds: null,
  godrays: null,
  screenSpaceReflections: null,
  atmosphereTopology: {
    clouds: false,
    godrays: false,
  },
  topologyKey: "-|-|-|-|-",
};

describe("Three viewport graph topology", () => {
  it.each([
    ["ambientOcclusion", { ambientOcclusion: {} as never }],
    ["bloom", { bloom: {} as never }],
    ["clouds", {
      clouds: {} as never,
      atmosphereTopology: { ...empty.atmosphereTopology, clouds: true },
    }],
    ["godrays", {
      godrays: {} as never,
      atmosphereTopology: { ...empty.atmosphereTopology, godrays: true },
    }],
    ["screenSpaceReflections", { screenSpaceReflections: {} as never }],
  ] as const)("activates the RenderPipeline path for %s", (_name, patch) => {
    const topology = createThreeViewportGraphTopology(
      { ...empty, ...patch },
      false,
      "depth32float",
    );
    expect(topology.postProcessingActive).toBe(true);
    expect(topology.physicalManifest.executions[
      topology.physicalManifest.executions.length - 1
    ]?.id).toBe("composite-present");
    expect(topology.executionPlan.postProcessingActive).toBe(true);
    expect(topology.physicalManifest.logicalTopologySignature)
      .toBe(topology.executionPlan.logicalTopologySignature);
  });

  it("keeps direct rendering when only base-pass compatibility is installed", () => {
    const topology = createThreeViewportGraphTopology(empty, false, "depth24plus");
    expect(topology.postProcessingActive).toBe(false);
    expect(topology.executionPlan.terminal).toBe("base-scene-direct");
    expect(topology.physicalManifest.executions.map(({ id }) => id))
      .toEqual(["base-scene-direct"]);
  });
});
