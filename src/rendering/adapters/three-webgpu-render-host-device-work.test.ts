import type { CanvasTarget } from "three/webgpu";
import { describe, expect, it, vi } from "vitest";
import type { ViewportRenderer, ViewportRendererOptions } from "../../three/renderer";
import {
  createThreeWebGpuRenderHost,
  type ThreeWebGpuRenderHostDependencies,
} from "./three-webgpu-render-host";

describe("Three WebGPU render host device work", () => {
  it("uses the bootstrap target without allocating a surface and restores it synchronously", async () => {
    const fixture = createFixture();
    const prematureWork = vi.fn();
    expect(fixture.host.execute(prematureWork)).toBe(false);
    expect(prematureWork).not.toHaveBeenCalled();
    await fixture.host.ready;
    const rogueTarget = fakeTarget("rogue");

    expect(fixture.host.execute((renderer) => {
      expect(renderer).toBe(fixture.renderer);
      expect(renderer.getCanvasTarget()).toBe(fixture.bootstrapTarget);
      renderer.setCanvasTarget(rogueTarget);
    })).toBe(true);

    expect(fixture.createCanvasTarget).not.toHaveBeenCalled();
    expect(fixture.renderer.getCanvasTarget()).toBe(fixture.bootstrapTarget);
    expect(fixture.setCanvasTarget).toHaveBeenNthCalledWith(1, fixture.bootstrapTarget);
    expect(fixture.setCanvasTarget).toHaveBeenLastCalledWith(fixture.bootstrapTarget);
    expect(() => fixture.host.execute(async () => undefined)).toThrow("complete synchronously");
    expect(fixture.renderer.getCanvasTarget()).toBe(fixture.bootstrapTarget);
    expect(() => fixture.host.execute(() => {
      fixture.renderer.setCanvasTarget(rogueTarget);
      throw new Error("recording failed");
    })).toThrow("recording failed");
    expect(fixture.renderer.getCanvasTarget()).toBe(fixture.bootstrapTarget);
    fixture.host.dispose();
  });

  it("forbids nesting with surfaces and defers renderer disposal through active device work", async () => {
    const fixture = createFixture();
    const surface = fixture.host.registerSurface({ width: 1, height: 1 } as HTMLCanvasElement);
    await fixture.host.ready;

    expect(fixture.host.execute(() => {
      expect(() => surface.render(() => undefined)).toThrow("must not be nested");
      expect(() => fixture.host.execute(() => undefined)).toThrow("must not be nested");
      expect(() => fixture.host.beginDeviceFrame()).toThrow("cannot begin during an active host callback");
      fixture.host.dispose();
      expect(fixture.rendererDispose).not.toHaveBeenCalled();
    })).toBe(true);

    expect(fixture.rendererDispose).toHaveBeenCalledOnce();
    expect(fixture.host.getStatus()).toBe("disposed");
    expect(fixture.host.execute(() => undefined)).toBe(false);
  });
});

function createFixture() {
  const bootstrapTarget = fakeTarget("bootstrap");
  let currentTarget = bootstrapTarget;
  const rendererDispose = vi.fn();
  const setCanvasTarget = vi.fn((target: CanvasTarget) => { currentTarget = target; });
  const renderer = {
    dispose: rendererDispose,
    getCanvasTarget: () => currentTarget,
    info: { reset: vi.fn() },
    setCanvasTarget,
  } as unknown as ViewportRenderer;
  const createCanvasTarget = vi.fn(() => fakeTarget("surface"));
  const dependencies: ThreeWebGpuRenderHostDependencies = {
    createRenderer: vi.fn((_options: ViewportRendererOptions) => ({
      renderer,
      backend: "webgpu" as const,
      ready: Promise.resolve(),
    })),
    createCanvasTarget,
    deviceFor: () => ({} as GPUDevice),
    claimFrameOwnership: vi.fn(() => ({ advanceFrame: vi.fn() })),
    observeDeviceLoss: () => () => undefined,
  };
  return {
    bootstrapTarget,
    createCanvasTarget,
    host: createThreeWebGpuRenderHost({}, dependencies),
    renderer,
    rendererDispose,
    setCanvasTarget,
  };
}

function fakeTarget(name: string): CanvasTarget {
  return {
    name,
    dispose: vi.fn(),
    setDrawingBufferSize: vi.fn(),
  } as unknown as CanvasTarget;
}
