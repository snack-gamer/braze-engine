import { describe, expect, it, vi } from "vitest";
import type { RendererFailureDiagnostic } from "../../three/device-lifecycle";
import { BRAZE_WEBGPU_REQUIRED_LIMITS } from "./three-webgpu-device-capabilities";
import type {
  ThreeWebGpuRenderSession,
  ThreeWebGpuRenderSessionOptions,
} from "./three-webgpu-render-session-contract";
import { createBrowserThreeWebGpuRenderSession } from "./browser-three-webgpu-session";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((onResolve) => { resolve = onResolve; });
  return { promise, resolve };
}

function deferredValue<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => { resolve = onResolve; });
  return { promise, resolve };
}

function sessionStub(
  overrides: Partial<ThreeWebGpuRenderSession> = {},
): ThreeWebGpuRenderSession {
  return {
    retireResources: async () => undefined,
    ready: Promise.resolve(),
    getStatus: () => "ready",
    opportunityForFrame: () => 1 as never,
    registerSurface: () => { throw new Error("not used"); },
    registerDeviceTaskLane: () => { throw new Error("not used"); },
    diagnostics: () => ({}) as never,
    summarize: () => ({}) as never,
    dispose: vi.fn(),
    disposeAsync: vi.fn(async () => undefined),
    ...overrides,
  };
}

function adapterWith(
  features: readonly GPUFeatureName[],
  requestDevice: (descriptor?: GPUDeviceDescriptor) => Promise<GPUDevice>,
): GPUAdapter {
  return {
    features: new Set(features),
    limits: BRAZE_WEBGPU_REQUIRED_LIMITS as unknown as GPUSupportedLimits,
    info: { isFallbackAdapter: false } as GPUAdapterInfo,
    requestDevice,
  } as unknown as GPUAdapter;
}

function dependenciesFor(
  adapter: GPUAdapter | null,
  createSession: (options: ThreeWebGpuRenderSessionOptions) => ThreeWebGpuRenderSession,
) {
  return {
    webGpuAvailable: () => true,
    requestAdapter: vi.fn(async () => adapter),
    createSession: vi.fn(createSession),
    createDeviceScopeId: () => "generated-device",
  };
}

describe("browser Three WebGPU session", () => {
  it("requests a validated core device and opts into timestamps only for diagnostics", async () => {
    const destroy = vi.fn();
    const requestDevice = vi.fn(async () => ({ destroy }) as unknown as GPUDevice);
    const adapter = adapterWith([
      "core-features-and-limits",
      "shader-f16",
      "timestamp-query",
    ], requestDevice);
    const session = sessionStub();
    const dependencies = dependenciesFor(adapter, () => session);

    const result = await createBrowserThreeWebGpuRenderSession(
      { deviceScopeId: "test-device", gpuTimingEnabled: true },
      dependencies,
    );

    expect(dependencies.requestAdapter).toHaveBeenCalledWith({
      powerPreference: "high-performance",
      featureLevel: "core",
    });
    expect(requestDevice).toHaveBeenCalledWith({
      requiredFeatures: ["core-features-and-limits", "shader-f16", "timestamp-query"],
      requiredLimits: BRAZE_WEBGPU_REQUIRED_LIMITS,
    });
    expect(dependencies.createSession).toHaveBeenCalledWith(expect.objectContaining({
      deviceScopeId: "test-device",
      gpuTimingEnabled: true,
    }));
    expect(result.deviceProfile).toMatchObject({
      featureLevel: "core",
      fallbackAdapter: false,
      timestampQueries: true,
    });
    const firstDisposal = result.disposeAsync();
    const secondDisposal = result.disposeAsync();
    expect(secondDisposal).toBe(firstDisposal);
    await firstDisposal;
    expect(session.disposeAsync).toHaveBeenCalledTimes(1);
    expect(session.dispose).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps timestamp timing off by default even when the adapter supports it", async () => {
    const destroy = vi.fn();
    const requestDevice = vi.fn(async () => ({ destroy }) as unknown as GPUDevice);
    const adapter = adapterWith([
      "core-features-and-limits",
      "timestamp-query",
      "shader-f16",
    ], requestDevice);
    const dependencies = dependenciesFor(adapter, () => sessionStub());

    const result = await createBrowserThreeWebGpuRenderSession({}, dependencies);

    expect(requestDevice).toHaveBeenCalledWith({
      requiredFeatures: ["core-features-and-limits", "shader-f16"],
      requiredLimits: BRAZE_WEBGPU_REQUIRED_LIMITS,
    });
    expect(dependencies.createSession).toHaveBeenCalledWith(expect.objectContaining({
      deviceScopeId: "generated-device",
      gpuTimingEnabled: false,
    }));
    await result.disposeAsync();
  });

  it("destroys the acquired device when session construction throws", async () => {
    const destroy = vi.fn();
    const adapter = adapterWith(
      ["core-features-and-limits"],
      async () => ({ destroy }) as unknown as GPUDevice,
    );
    const dependencies = dependenciesFor(adapter, () => { throw new Error("session failed"); });

    await expect(createBrowserThreeWebGpuRenderSession({}, dependencies)).rejects.toThrow("session failed");
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("gracefully releases the session and device when renderer readiness rejects", async () => {
    const destroy = vi.fn();
    const adapter = adapterWith(
      ["core-features-and-limits"],
      async () => ({ destroy }) as unknown as GPUDevice,
    );
    const session = sessionStub({ ready: Promise.reject(new Error("renderer init failed")) });
    const dependencies = dependenciesFor(adapter, () => session);
    const result = await createBrowserThreeWebGpuRenderSession({}, dependencies);

    await expect(result.ready).rejects.toThrow("renderer init failed");
    expect(session.disposeAsync).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
    await result.disposeAsync();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("destroys the owned device after a runtime renderer failure without trusting observers", async () => {
    const destroy = vi.fn();
    const adapter = adapterWith(
      ["core-features-and-limits"],
      async () => ({ destroy }) as unknown as GPUDevice,
    );
    const sessionDisposal = deferred();
    const session = sessionStub({
      disposeAsync: vi.fn(() => sessionDisposal.promise),
    });
    let publishFailure: ((diagnostic: RendererFailureDiagnostic) => void) | undefined;
    const dependencies = dependenciesFor(adapter, (sessionOptions) => {
      publishFailure = sessionOptions.onRendererFailure;
      return session;
    });
    const observerFailure = new Error("renderer observer failed");
    const onError = vi.fn();
    const onRendererFailure = vi.fn(() => {
      expect(session.disposeAsync).toHaveBeenCalledOnce();
      throw observerFailure;
    });
    const result = await createBrowserThreeWebGpuRenderSession(
      { onError, onRendererFailure },
      dependencies,
    );
    const diagnostic: RendererFailureDiagnostic = {
      kind: "device-lost",
      reason: "unknown",
      message: "WebGPU device lost (unknown): reset",
    };

    expect(() => publishFailure?.(diagnostic)).not.toThrow();
    expect(onRendererFailure).toHaveBeenCalledWith(diagnostic);
    expect(onError).toHaveBeenCalledWith(observerFailure);
    expect(session.disposeAsync).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();

    sessionDisposal.resolve();
    await result.disposeAsync();
    expect(session.disposeAsync).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("stops after adapter acquisition when startup is aborted", async () => {
    const controller = new AbortController();
    const adapterResult = deferredValue<GPUAdapter | null>();
    const requestDevice = vi.fn(async () => ({ destroy: vi.fn() }) as unknown as GPUDevice);
    const adapter = adapterWith(["core-features-and-limits"], requestDevice);
    const createSession = vi.fn(() => sessionStub());
    const startup = createBrowserThreeWebGpuRenderSession(
      { signal: controller.signal },
      {
        webGpuAvailable: () => true,
        requestAdapter: vi.fn(() => adapterResult.promise),
        createSession,
        createDeviceScopeId: () => "cancelled-adapter",
      },
    );

    controller.abort();
    adapterResult.resolve(adapter);

    await expect(startup).rejects.toMatchObject({ name: "AbortError" });
    expect(requestDevice).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("destroys a device that arrives after startup is aborted", async () => {
    const controller = new AbortController();
    const deviceResult = deferredValue<GPUDevice>();
    const destroy = vi.fn();
    const requestDevice = vi.fn(() => deviceResult.promise);
    const adapter = adapterWith(["core-features-and-limits"], requestDevice);
    const createSession = vi.fn(() => sessionStub());
    const dependencies = dependenciesFor(adapter, createSession);
    const startup = createBrowserThreeWebGpuRenderSession(
      { signal: controller.signal },
      dependencies,
    );
    await vi.waitFor(() => expect(requestDevice).toHaveBeenCalledOnce());

    controller.abort();
    deviceResult.resolve({ destroy } as unknown as GPUDevice);

    await expect(startup).rejects.toMatchObject({ name: "AbortError" });
    expect(createSession).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("disposes the session and device when aborted during renderer readiness", async () => {
    const controller = new AbortController();
    const rendererReady = deferred();
    const sessionDisposal = deferred();
    const destroy = vi.fn();
    const adapter = adapterWith(
      ["core-features-and-limits"],
      async () => ({ destroy }) as unknown as GPUDevice,
    );
    const session = sessionStub({
      ready: rendererReady.promise,
      disposeAsync: vi.fn(() => sessionDisposal.promise),
    });
    const result = await createBrowserThreeWebGpuRenderSession(
      { signal: controller.signal },
      dependenciesFor(adapter, () => session),
    );
    const readiness = expect(result.ready).rejects.toMatchObject({ name: "AbortError" });

    controller.abort();
    expect(session.disposeAsync).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();

    sessionDisposal.resolve();
    await readiness;
    expect(destroy).toHaveBeenCalledOnce();
    await result.disposeAsync();
    expect(session.disposeAsync).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
    rendererReady.resolve();
  });

  it("fails explicitly when no adapter can satisfy the core baseline", async () => {
    await expect(createBrowserThreeWebGpuRenderSession(
      {},
      dependenciesFor(null, () => sessionStub()),
    )).rejects.toThrow("No core WebGPU adapter");
  });
});
