import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultEnvironment } from "../../../constants";
import type { ViewportRenderer } from "../../../three/renderer";
import { createThreeViewportPostGraph } from "./viewport-post-graph";
import { createViewportRenderPipeline } from "./viewport-render-pipeline";

vi.mock("./viewport-post-graph", () => ({
  createThreeViewportPostGraph: vi.fn(),
}));

describe("viewport render pipeline topology", () => {
  beforeEach(() => vi.mocked(createThreeViewportPostGraph).mockReset());

  it("rebuilds for active topology but applies live settings in place", () => {
    const graph = { apply: vi.fn(), render: vi.fn(), dispose: vi.fn() };
    vi.mocked(createThreeViewportPostGraph).mockReturnValue(graph);
    const renderer = fakeRenderer();
    const pipeline = createViewportRenderPipeline(
      renderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
      new THREE.DirectionalLight(),
    );
    const first = { ...defaultEnvironment.sky, cloudsCoverage: 0.3, godraysIntensity: 0 };
    const liveChange = { ...first, cloudsCoverage: 0.8, cloudsDensity: 0.9 };

    pipeline.setSkyEffects(first, true);
    pipeline.render();
    pipeline.render();
    expect(createThreeViewportPostGraph).toHaveBeenCalledOnce();
    expect(graph.apply).not.toHaveBeenCalled();
    expect(graph.render).toHaveBeenCalledTimes(2);

    pipeline.setSkyEffects(liveChange, true);
    pipeline.render();
    pipeline.render();
    expect(createThreeViewportPostGraph).toHaveBeenCalledOnce();
    expect(graph.apply).toHaveBeenCalledOnce();
    expect(pipeline.atmosphereTopology).toEqual({
      clouds: true,
      godrays: false,
    });
    expect(pipeline.graphPackage.features.clouds).toBe(true);
    expect(pipeline.physicalManifest.targets.map(({ id }) => id)).toEqual([
      "scene-pass",
      "clouds",
    ]);
    expect(vi.mocked(createThreeViewportPostGraph).mock.calls[0]?.[5])
      .toBe(pipeline.executionPlan);
  });

  it("returns to direct rendering when the last sky contribution is disabled", () => {
    const graph = { apply: vi.fn(), render: vi.fn(), dispose: vi.fn() };
    vi.mocked(createThreeViewportPostGraph).mockReturnValue(graph);
    const renderer = fakeRenderer();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const pipeline = createViewportRenderPipeline(
      renderer,
      scene,
      camera,
      new THREE.DirectionalLight(),
    );

    pipeline.setSkyEffects(defaultEnvironment.sky, true);
    pipeline.render();
    pipeline.setSkyEffects({
      ...defaultEnvironment.sky,
      cloudsCoverage: 0,
      godraysIntensity: 0,
    }, true);
    pipeline.render();

    expect(graph.dispose).toHaveBeenCalledOnce();
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
    expect(pipeline.cloudsActive).toBe(false);
  });

  it("retains post resources while shadow availability changes", () => {
    const graph = { apply: vi.fn(), render: vi.fn(), dispose: vi.fn() };
    vi.mocked(createThreeViewportPostGraph).mockReturnValue(graph);
    const pipeline = createViewportRenderPipeline(
      fakeRenderer(),
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
      new THREE.DirectionalLight(),
    );
    pipeline.setSkyEffects(defaultEnvironment.sky, true);
    pipeline.render();
    const withoutShadows = pipeline.topologyKey;

    for (const active of [true, false, true, false]) {
      pipeline.setShadowsActive(active);
      pipeline.render();
      expect(pipeline.executionPlan.shadowsActive).toBe(active);
      expect(pipeline.topologyKey === withoutShadows).toBe(!active);
    }

    expect(createThreeViewportPostGraph).toHaveBeenCalledOnce();
    expect(graph.dispose).not.toHaveBeenCalled();
    expect(graph.render).toHaveBeenCalledTimes(5);
    pipeline.dispose();
    expect(graph.dispose).toHaveBeenCalledOnce();
  });

  it("compiles shadow structure without forcing an offscreen color chain", () => {
    const renderer = fakeRenderer();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const pipeline = createViewportRenderPipeline(
      renderer,
      scene,
      camera,
      new THREE.DirectionalLight(),
    );
    const directTopology = pipeline.topologyKey;

    pipeline.setShadowsActive(true);
    pipeline.render();

    expect(pipeline.topologyKey).not.toBe(directTopology);
    expect(pipeline.graphPackage.features.shadows).toBe(true);
    expect(pipeline.graphPackage.graph.passes.map(({ payload }) => payload?.kind))
      .toEqual(["shadows", "base-scene"]);
    expect(createThreeViewportPostGraph).not.toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
  });
});

function fakeRenderer(): ViewportRenderer {
  return {
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    render: vi.fn(),
  } as unknown as ViewportRenderer;
}
