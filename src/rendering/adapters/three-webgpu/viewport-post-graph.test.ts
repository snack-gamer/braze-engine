import { beforeEach, describe, expect, it, vi } from "vitest";
import { compileViewportRenderGraphPackage } from "../../runtime/viewport-graph/viewport-graph-package";
import type { ViewportRenderFeatures } from "../../runtime/viewport-render-graph";
import { compileThreeViewportExecutionPlan } from "./three-viewport-execution-plan";
import type { ActiveViewportPostEffects } from "./viewport-post-effect-state";

const mocks = vi.hoisted(() => {
  const textures = new Map<string, object>();
  const texture = (name: string) => {
    const existing = textures.get(name);
    if (existing) return existing;
    const created = { name };
    textures.set(name, created);
    return created;
  };
  const effectNode = () => ({
    radius: { value: 0 },
    thickness: { value: 0 },
    distanceFallOff: { value: 0 },
    samples: { value: 0 },
    getTextureNode: vi.fn(() => texture("effect")),
    dispose: vi.fn(),
  });
  return {
    ao: vi.fn(() => effectNode()),
    scenePass: {
      setMRT: vi.fn(),
      getTextureNode: vi.fn((name: string) => texture(name)),
      dispose: vi.fn(),
    },
  };
});

vi.mock("three/webgpu", () => ({
  RenderPipeline: class {
    outputNode: unknown;
    needsUpdate = false;
    render = vi.fn();
    dispose = vi.fn();
  },
}));

vi.mock("three/addons/tsl/display/GTAONode.js", () => ({ ao: mocks.ao }));
vi.mock("three/addons/tsl/display/BloomNode.js", () => ({ bloom: vi.fn() }));
vi.mock("three/addons/tsl/display/SSRNode.js", () => ({
  ssr: vi.fn(() => ({ getTextureNode: vi.fn(), dispose: vi.fn() })),
}));
vi.mock("../../../three/tsl", () => ({
  Fn: vi.fn(() => () => ({})),
  float: vi.fn(),
  metalness: {},
  mix: vi.fn(),
  mrt: vi.fn((value) => value),
  normalView: {},
  oneMinus: vi.fn(),
  output: {},
  pass: vi.fn(() => mocks.scenePass),
  roughness: {},
  step: vi.fn(),
  uniform: vi.fn((value) => ({ value })),
  uv: vi.fn(),
  vec3: vi.fn(),
  vec4: vi.fn(),
}));
vi.mock("../../../three/gi/bloom", () => ({ applyBloomSettings: vi.fn() }));
vi.mock("../../../three/gi/reflections", () => ({ configureSsrNode: vi.fn() }));
vi.mock("./atmosphere/godrays-source-mask-node", () => ({ GodraysSourceMaskNode: class {} }));
vi.mock("./atmosphere/quarter-resolution-cloud-node", () => ({ QuarterResolutionCloudNode: class {} }));
vi.mock("./radial-godrays-node", () => ({ RadialGodraysNode: class {} }));

import { createThreeViewportPostGraph } from "./viewport-post-graph";

const disabled: ViewportRenderFeatures = {
  ambientOcclusion: false,
  bloom: false,
  clouds: false,
  godrays: false,
  overlays: false,
  particleBasePassCompatibility: true,
  screenSpaceReflections: false,
  shadows: false,
};

describe("Three viewport post graph", () => {
  beforeEach(() => {
    mocks.ao.mockClear();
    mocks.scenePass.setMRT.mockClear();
  });

  it("gives GTAO no normal node when the compiled pass requests reconstruction", () => {
    const camera = {};
    const plan = compileThreeViewportExecutionPlan(compileViewportRenderGraphPackage({
      ...disabled,
      ambientOcclusion: true,
    }));

    createThreeViewportPostGraph(
      {} as never,
      {} as never,
      camera as never,
      {} as never,
      effects({ ambientOcclusion: {} as never }),
      plan,
    );

    expect(mocks.ao).toHaveBeenCalledWith(expect.objectContaining({ name: "depth" }), null, camera);
    expect(mocks.scenePass.setMRT).not.toHaveBeenCalled();
  });

  it("gives GTAO the scene-normal MRT node when SSR makes it a compiled input", () => {
    const camera = {};
    const plan = compileThreeViewportExecutionPlan(compileViewportRenderGraphPackage({
      ...disabled,
      ambientOcclusion: true,
      screenSpaceReflections: true,
    }));

    createThreeViewportPostGraph(
      {} as never,
      {} as never,
      camera as never,
      {} as never,
      effects({
        ambientOcclusion: {} as never,
        screenSpaceReflections: {} as never,
      }),
      plan,
    );

    expect(mocks.ao).toHaveBeenCalledWith(
      expect.objectContaining({ name: "depth" }),
      expect.objectContaining({ name: "normal" }),
      camera,
    );
    expect(mocks.scenePass.setMRT).toHaveBeenCalledOnce();
  });
});

function effects(patch: Partial<ActiveViewportPostEffects>): ActiveViewportPostEffects {
  return {
    ambientOcclusion: null,
    bloom: null,
    clouds: null,
    godrays: null,
    screenSpaceReflections: null,
    atmosphereTopology: { clouds: false, godrays: false },
    topologyKey: "test",
    ...patch,
  };
}
