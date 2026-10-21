import type { CanvasTarget } from "three/webgpu";
import { describe, expect, it, vi } from "vitest";
import type { RendererFailureDiagnostic } from "../../three/device-lifecycle";
import type { ViewportRenderer, ViewportRendererOptions } from "../../three/renderer";
import {
  createThreeWebGpuRenderHost,
  type ThreeWebGpuRenderHostDependencies,
  type ThreeWebGpuRenderHostOptions,
} from "./three-webgpu-render-host";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

type FakeCanvasTarget = {
  target: CanvasTarget;
  setDrawingBufferSize: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

function canvas(name: string): HTMLCanvasElement {
  return { dataset: { testName: name }, height: 1, width: 1 } as unknown as HTMLCanvasElement;
}

function createFixture(
  initialization: Promise<void> = Promise.resolve(),
  options: ThreeWebGpuRenderHostOptions = {},
) {
  const events: string[] = [];
  const targetNames = new Map<CanvasTarget, string>();
  const targets = new Map<HTMLCanvasElement | OffscreenCanvas, FakeCanvasTarget>();
  const bootstrapCanvas = canvas("bootstrap");
  const bootstrap = createFakeTarget(bootstrapCanvas);
  targetNames.set(bootstrap.target, "bootstrap");
  let currentTarget = bootstrap.target;
  const resetFrameInfo = vi.fn();
  const rendererDispose = vi.fn();
  const setCanvasTarget = vi.fn((target: CanvasTarget) => {
    currentTarget = target;
    events.push(`select:${targetNames.get(target) ?? "unknown"}`);
  });
  const renderer = {
    dispose: rendererDispose,
    getCanvasTarget: vi.fn(() => currentTarget),
    info: { reset: resetFrameInfo },
    setCanvasTarget,
  } as unknown as ViewportRenderer;
  const createRenderer = vi.fn((_rendererOptions: ViewportRendererOptions) => ({
    renderer,
    backend: "webgpu" as const,
    ready: initialization,
  }));
  const device = {} as GPUDevice;
  const deviceFor = vi.fn(() => device);
  const advanceFrame = vi.fn();
  const claimFrameOwnership = vi.fn(() => ({ advanceFrame }));
  let deviceLossListener: ((diagnostic: RendererFailureDiagnostic) => void) | null = null;
  const stopDeviceLossObservation = vi.fn();
  const observeDeviceLoss = vi.fn(
    (_device: GPUDevice, listener: (diagnostic: RendererFailureDiagnostic) => void) => {
      deviceLossListener = listener;
      return stopDeviceLossObservation;
    },
  );
  const createCanvasTarget = vi.fn((surfaceCanvas: HTMLCanvasElement | OffscreenCanvas) => {
    const target = createFakeTarget(surfaceCanvas);
    const name =
      "dataset" in surfaceCanvas
        ? (surfaceCanvas as HTMLCanvasElement).dataset.testName ?? "surface"
        : "offscreen";
    targetNames.set(target.target, name);
    targets.set(surfaceCanvas, target);
    return target.target;
  });
  const dependencies: ThreeWebGpuRenderHostDependencies = {
    createRenderer,
    createCanvasTarget,
    deviceFor,
    claimFrameOwnership,
    observeDeviceLoss,
  };
  const host = createThreeWebGpuRenderHost(options, dependencies);
  return {
    bootstrap,
    advanceFrame,
    createCanvasTarget,
    createRenderer,
    claimFrameOwnership,
    deviceFor,
    emitDeviceLoss: (diagnostic: RendererFailureDiagnostic) => deviceLossListener?.(diagnostic),
    events,
    host,
    observeDeviceLoss,
    renderer,
    rendererDispose,
    resetFrameInfo,
    setCanvasTarget,
    stopDeviceLossObservation,
    targets,
  };
}

function createFakeTarget(surfaceCanvas: HTMLCanvasElement | OffscreenCanvas): FakeCanvasTarget {
  const setDrawingBufferSize = vi.fn();
  const dispose = vi.fn();
  return {
    target: {
      domElement: surfaceCanvas,
      dispose,
      setDrawingBufferSize,
    } as unknown as CanvasTarget,
    dispose,
    setDrawingBufferSize,
  };
}

describe("Three WebGPU render host", () => {
  it("owns one renderer and explicitly selects every surface submission", async () => {
    const rendererOptions = {
      antialias: true,
      device: {} as GPUDevice,
      powerPreference: "high-performance" as const,
      trackTimestamp: true,
    };
    const fixture = createFixture(Promise.resolve(), { rendererOptions });
    const sceneCanvas = canvas("scene");
    const gameCanvas = canvas("game");
    const scene = fixture.host.registerSurface(sceneCanvas);
    const game = fixture.host.registerSurface(gameCanvas);
    await fixture.host.ready;

    expect(fixture.createRenderer).toHaveBeenCalledOnce();
    expect(fixture.createRenderer).toHaveBeenCalledWith(rendererOptions);
    expect(fixture.createCanvasTarget).toHaveBeenCalledTimes(2);
    expect(fixture.claimFrameOwnership).toHaveBeenCalledOnce();
    expect(fixture.claimFrameOwnership).toHaveBeenCalledWith(fixture.renderer);
    scene.render((renderer) => {
      expect(renderer).toBe(fixture.renderer);
      expect(renderer.getCanvasTarget()).toBe(fixture.targets.get(sceneCanvas)?.target);
      fixture.events.push("render:scene");
    });
    expect(fixture.renderer.getCanvasTarget()).toBe(fixture.bootstrap.target);
    game.render((renderer) => {
      expect(renderer.getCanvasTarget()).toBe(fixture.targets.get(gameCanvas)?.target);
      fixture.events.push("render:game");
    });
    scene.render(() => fixture.events.push("render:scene-again"));

    expect(fixture.events).toEqual([
      "select:scene",
      "render:scene",
      "select:bootstrap",
      "select:game",
      "render:game",
      "select:bootstrap",
      "select:scene",
      "render:scene-again",
      "select:bootstrap",
    ]);
    fixture.host.dispose();
    expect(fixture.renderer.dispose).toHaveBeenCalledOnce();
  });

  it("owns sizing, duplicate registration, and idempotent surface disposal", async () => {
    const fixture = createFixture();
    const sceneCanvas = canvas("scene");
    const gameCanvas = canvas("game");
    const scene = fixture.host.registerSurface(sceneCanvas);
    const game = fixture.host.registerSurface(gameCanvas);
    const target = fixture.targets.get(sceneCanvas)!;
    const gameTarget = fixture.targets.get(gameCanvas)!;
    await fixture.host.ready;

    expect(() => fixture.host.registerSurface(sceneCanvas)).toThrow("already registered");
    expect(scene.resize({ width: 640.5, height: 360, pixelRatio: 2 })).toBe(true);
    expect(target.setDrawingBufferSize).toHaveBeenCalledWith(640.5, 360, 2);
    expect(game.resize({ width: 1280, height: 720, pixelRatio: 1 })).toBe(true);
    expect(gameTarget.setDrawingBufferSize).toHaveBeenCalledWith(1280, 720, 1);
    expect(target.setDrawingBufferSize).toHaveBeenCalledTimes(1);
    expect(fixture.events).toEqual([
      "select:scene",
      "select:bootstrap",
      "select:game",
      "select:bootstrap",
    ]);
    gameTarget.setDrawingBufferSize.mockImplementationOnce(() => {
      throw new Error("resize failed");
    });
    expect(() => game.resize({ width: 800, height: 600, pixelRatio: 1 })).toThrow("resize failed");
    expect(fixture.renderer.getCanvasTarget()).toBe(fixture.bootstrap.target);
    expect(() => scene.resize({ width: -1, height: 1, pixelRatio: 1 })).toThrow(
      "finite, non-negative",
    );
    scene.render(() => undefined);
    scene.dispose();
    scene.dispose();

    expect(target.dispose).toHaveBeenCalledOnce();
    expect(fixture.events[fixture.events.length - 1]).toBe("select:bootstrap");
    expect(scene.render(() => undefined)).toBe(false);
    expect(scene.resize({ width: 1, height: 1, pixelRatio: 1 })).toBe(false);
    const replacement = fixture.host.registerSurface(sceneCanvas);
    scene.dispose();
    expect(replacement.resize({ width: 320, height: 180, pixelRatio: 1 })).toBe(true);
    fixture.host.dispose();
  });

  it("blocks rendering until ready and disposes stale initialization safely", async () => {
    const initialization = deferred<void>();
    const fixture = createFixture(initialization.promise);
    const sceneCanvas = canvas("scene");
    const scene = fixture.host.registerSurface(sceneCanvas);

    expect(scene.configure((renderer) => {
      expect(renderer).toBe(fixture.renderer);
      fixture.events.push("configure:scene");
    })).toBe(true);
    expect(scene.render(() => fixture.events.push("unexpected"))).toBe(false);
    expect(fixture.events.slice(0, 3)).toEqual([
      "select:scene",
      "configure:scene",
      "select:bootstrap",
    ]);
    fixture.host.dispose();
    expect(fixture.host.getStatus()).toBe("disposed");
    expect(fixture.targets.get(sceneCanvas)?.dispose).toHaveBeenCalledOnce();
    expect(fixture.renderer.dispose).not.toHaveBeenCalled();
    expect(scene.configure(() => undefined)).toBe(false);

    initialization.resolve();
    await fixture.host.ready;
    expect(fixture.deviceFor).not.toHaveBeenCalled();
    expect(fixture.observeDeviceLoss).not.toHaveBeenCalled();
    expect(fixture.renderer.dispose).toHaveBeenCalledOnce();
  });

  it("publishes device loss and rejects later surface work", async () => {
    const onFailure = vi.fn();
    const fixture = createFixture(Promise.resolve(), { onFailure });
    const scene = fixture.host.registerSurface(canvas("scene"));
    await fixture.host.ready;
    expect(fixture.host.getStatus()).toBe("ready");

    const diagnostic: RendererFailureDiagnostic = {
      kind: "device-lost",
      reason: "unknown",
      message: "WebGPU device lost (unknown): adapter reset",
    };
    fixture.emitDeviceLoss(diagnostic);

    expect(fixture.host.getStatus()).toBe("device-lost");
    expect(onFailure).toHaveBeenCalledWith(diagnostic);
    expect(scene.configure(() => undefined)).toBe(false);
    expect(scene.render(() => undefined)).toBe(false);
    expect(scene.resize({ width: 320, height: 180, pixelRatio: 1 })).toBe(false);
    expect(() => fixture.host.registerSurface(canvas("game"))).toThrow("device-lost");
    fixture.host.dispose();
    expect(fixture.stopDeviceLossObservation).toHaveBeenCalledOnce();
  });

  it("releases owned resources when initialization fails", async () => {
    const initialization = deferred<void>();
    const onFailure = vi.fn();
    const fixture = createFixture(initialization.promise, { onFailure });
    const sceneCanvas = canvas("scene");
    fixture.host.registerSurface(sceneCanvas);

    initialization.reject(new Error("adapter unavailable"));
    await expect(fixture.host.ready).rejects.toThrow("adapter unavailable");

    expect(fixture.host.getStatus()).toBe("failed");
    expect(fixture.targets.get(sceneCanvas)?.dispose).toHaveBeenCalledOnce();
    expect(fixture.renderer.dispose).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledWith({
      kind: "initialization",
      reason: "initialization-failed",
      message: "WebGPU renderer initialization failed: adapter unavailable",
    });
    fixture.host.dispose();
    expect(fixture.renderer.dispose).toHaveBeenCalledOnce();
  });

  it("forbids nested and asynchronous submissions from escaping target ownership", async () => {
    const fixture = createFixture();
    const scene = fixture.host.registerSurface(canvas("scene"));
    const game = fixture.host.registerSurface(canvas("game"));
    await fixture.host.ready;

    expect(() => scene.render(() => game.render(() => undefined))).toThrow("must not be nested");
    expect(fixture.events).not.toContain("select:game");
    expect(() => scene.render(async () => undefined)).toThrow("complete synchronously");
    expect(() => scene.render(() => { throw new Error("recording failed"); })).toThrow(
      "recording failed",
    );
    expect(() => scene.configure(() => game.configure(() => undefined))).toThrow("must not be nested");
    expect(() => scene.configure(async () => undefined)).toThrow("complete synchronously");
    expect(() => scene.render(() => scene.resize({ width: 1, height: 1, pixelRatio: 1 }))).toThrow(
      "cannot be resized during an active host callback",
    );
    expect(fixture.renderer.getCanvasTarget()).toBe(fixture.bootstrap.target);
    fixture.host.dispose();
  });

  it("resets renderer info only at an explicitly owned device-frame boundary", async () => {
    const fixture = createFixture();
    const scene = fixture.host.registerSurface(canvas("scene"));

    expect(fixture.host.beginDeviceFrame()).toBe(true);
    expect(fixture.resetFrameInfo).toHaveBeenCalledOnce();
    expect(fixture.advanceFrame).not.toHaveBeenCalled();
    await fixture.host.ready;
    scene.configure(() => undefined);
    scene.render(() => undefined);
    expect(fixture.resetFrameInfo).toHaveBeenCalledOnce();
    expect(fixture.host.beginDeviceFrame()).toBe(true);
    expect(fixture.resetFrameInfo).toHaveBeenCalledTimes(2);
    expect(fixture.advanceFrame).toHaveBeenCalledOnce();
    expect(() => scene.render(() => fixture.host.beginDeviceFrame())).toThrow(
      "cannot begin during an active host callback",
    );
    fixture.host.dispose();
    expect(fixture.host.beginDeviceFrame()).toBe(false);
  });

  it("contains teardown failures and continues releasing every owner", async () => {
    const onError = vi.fn();
    const fixture = createFixture(Promise.resolve(), { onError });
    const sceneCanvas = canvas("scene");
    const gameCanvas = canvas("game");
    fixture.host.registerSurface(sceneCanvas);
    fixture.host.registerSurface(gameCanvas);
    await fixture.host.ready;
    fixture.stopDeviceLossObservation.mockImplementation(() => { throw new Error("listener failed"); });
    fixture.targets.get(sceneCanvas)?.dispose.mockImplementation(() => { throw new Error("target failed"); });
    fixture.rendererDispose.mockImplementation(() => { throw new Error("renderer failed"); });

    expect(() => fixture.host.dispose()).not.toThrow();

    expect(fixture.targets.get(sceneCanvas)?.dispose).toHaveBeenCalledOnce();
    expect(fixture.targets.get(gameCanvas)?.dispose).toHaveBeenCalledOnce();
    expect(fixture.rendererDispose).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it("defers disposal requested inside a submission until recording finishes", async () => {
    const fixture = createFixture();
    const sceneCanvas = canvas("scene");
    const scene = fixture.host.registerSurface(sceneCanvas);
    const target = fixture.targets.get(sceneCanvas)!;
    await fixture.host.ready;

    expect(
      scene.render(() => {
        fixture.host.dispose();
        expect(target.dispose).not.toHaveBeenCalled();
        expect(fixture.renderer.dispose).not.toHaveBeenCalled();
      }),
    ).toBe(true);
    expect(target.dispose).toHaveBeenCalledOnce();
    expect(fixture.renderer.dispose).toHaveBeenCalledOnce();
    expect(fixture.host.getStatus()).toBe("disposed");
    const selectionOrders = fixture.setCanvasTarget.mock.invocationCallOrder;
    const restoredAt = selectionOrders[selectionOrders.length - 1];
    expect(restoredAt).toBeLessThan(target.dispose.mock.invocationCallOrder[0]);
    expect(target.dispose.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.rendererDispose.mock.invocationCallOrder[0],
    );
  });
});
