import { describe, expect, it, vi } from "vitest";
import {
  CubeTexture,
  Scene,
  WebGPUCoordinateSystem,
  type Renderer,
} from "three/webgpu";
import { createThreeReflectionProbeCaptureTarget } from "./three-reflection-probe-capture-target";

describe("Three reflection probe capture target", () => {
  it("renders all six cube faces synchronously and restores public renderer state", () => {
    const fixture = rendererFixture();
    const scene = new Scene();
    const target = createThreeReflectionProbeCaptureTarget();

    target.capture(fixture.renderer, scene, { x: 3, y: 4, z: 5 });

    expect(fixture.render).toHaveBeenCalledTimes(6);
    expect(fixture.render.mock.calls.every(([renderedScene]) => renderedScene === scene)).toBe(true);
    expect(fixture.setRenderTarget.mock.calls.slice(0, 6).map((call) => call[1])).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(fixture.current()).toEqual({
      target: fixture.previousTarget,
      face: 4,
      mipmap: 2,
    });
    expect(fixture.renderer.xr.enabled).toBe(true);
    expect(fixture.renderer.shadowMap.enabled).toBe(true);
    expect(target.getTexture().generateMipmaps).toBe(true);
  });

  it("masks its own environment on a second capture but preserves an authored environment", () => {
    const fixture = rendererFixture();
    const scene = new Scene();
    const target = createThreeReflectionProbeCaptureTarget();
    const renderedEnvironments: Array<Scene["environment"]> = [];
    fixture.render.mockImplementation((renderedScene) => {
      renderedEnvironments.push(renderedScene.environment);
    });

    target.capture(fixture.renderer, scene, { x: 0, y: 0, z: 0 });
    scene.environment = target.getTexture();
    target.capture(fixture.renderer, scene, { x: 0, y: 0, z: 0 });

    expect(renderedEnvironments.slice(6, 12)).toEqual(Array(6).fill(null));
    expect(scene.environment).toBe(target.getTexture());

    const authoredEnvironment = new CubeTexture();
    scene.environment = authoredEnvironment;
    target.capture(fixture.renderer, scene, { x: 0, y: 0, z: 0 });

    expect(renderedEnvironments.slice(12, 18))
      .toEqual(Array(6).fill(authoredEnvironment));
    expect(scene.environment).toBe(authoredEnvironment);
  });

  it("restores target, cube face, mipmap, environment, XR, and mipmap generation after a face throws", () => {
    const failure = new Error("face render failed");
    const fixture = rendererFixture(3, failure);
    const target = createThreeReflectionProbeCaptureTarget();
    const scene = new Scene();
    scene.environment = target.getTexture();

    expect(() => target.capture(fixture.renderer, scene, { x: 0, y: 0, z: 0 })).toThrow(failure);
    expect(fixture.render).toHaveBeenCalledTimes(3);
    expect(fixture.current()).toEqual({
      target: fixture.previousTarget,
      face: 4,
      mipmap: 2,
    });
    expect(fixture.renderer.xr.enabled).toBe(true);
    expect(fixture.renderer.shadowMap.enabled).toBe(true);
    expect(scene.environment).toBe(target.getTexture());
    expect(target.getTexture().generateMipmaps).toBe(true);
  });

  it("validates resource dimensions and rejects capture after disposal", () => {
    expect(() => createThreeReflectionProbeCaptureTarget({ resolution: 0 })).toThrow(/resolution/);
    expect(() => createThreeReflectionProbeCaptureTarget({ near: 2, far: 1 })).toThrow(/far distance/);
    const target = createThreeReflectionProbeCaptureTarget({ resolution: 16 });
    target.dispose();
    target.dispose();
    expect(() => target.capture(rendererFixture().renderer, new Scene(), { x: 0, y: 0, z: 0 }))
      .toThrow(/disposed/);
  });
});

function rendererFixture(throwOnRenderCall?: number, failure?: Error) {
  const previousTarget = { name: "previous-target" };
  let currentTarget: unknown = previousTarget;
  let activeFace = 4;
  let activeMipmap = 2;
  const setRenderTarget = vi.fn((target: unknown, face = 0, mipmap = 0) => {
    currentTarget = target;
    activeFace = face;
    activeMipmap = mipmap;
  });
  let renderCalls = 0;
  const render = vi.fn<(scene: Scene, camera: unknown) => void>(() => {
    renderCalls += 1;
    if (renderCalls === throwOnRenderCall) throw failure;
  });
  const renderer = {
    autoClear: true,
    coordinateSystem: WebGPUCoordinateSystem,
    getActiveCubeFace: () => activeFace,
    getActiveMipmapLevel: () => activeMipmap,
    getRenderTarget: () => currentTarget,
    render,
    reversedDepthBuffer: false,
    setRenderTarget,
    shadowMap: { enabled: true },
    xr: { enabled: true },
  } as unknown as Renderer;
  return {
    current: () => ({ target: currentTarget, face: activeFace, mipmap: activeMipmap }),
    previousTarget,
    render,
    renderer,
    setRenderTarget,
  };
}
