import {
  createThreeWebGpuRenderSession,
} from "./three-webgpu-render-session";
import {
  compileThreeWebGpuDeviceCapabilityProfile,
  type ThreeWebGpuDeviceCapabilityProfile,
} from "./three-webgpu-device-capabilities";
import type {
  ThreeWebGpuRenderSession,
  ThreeWebGpuRenderSessionOptions,
} from "./three-webgpu-render-session-contract";

export type BrowserThreeWebGpuRenderSession = ThreeWebGpuRenderSession & Readonly<{
  deviceProfile: ThreeWebGpuDeviceCapabilityProfile;
}>;

export type BrowserThreeWebGpuSessionOptions = Readonly<{
  signal?: AbortSignal;
  deviceScopeId?: string;
  /** Enables diagnostic per-pass timestamps; kept off the production hot path by default. */
  gpuTimingEnabled?: boolean;
  maxEpochsInFlight?: number;
  onError?: (error: unknown) => void;
  onRendererFailure?: ThreeWebGpuRenderSessionOptions["onRendererFailure"];
}>;

export type BrowserThreeWebGpuSessionDependencies = Readonly<{
  webGpuAvailable: () => boolean;
  requestAdapter: (options: GPURequestAdapterOptions) => Promise<GPUAdapter | null>;
  createSession: typeof createThreeWebGpuRenderSession;
  createDeviceScopeId: () => string;
}>;

const DEFAULT_DEPENDENCIES: BrowserThreeWebGpuSessionDependencies = {
  webGpuAvailable: () => typeof navigator !== "undefined" && "gpu" in navigator,
  requestAdapter: (options) => navigator.gpu.requestAdapter(options),
  createSession: createThreeWebGpuRenderSession,
  createDeviceScopeId: () => `editor-${crypto.randomUUID()}`,
};

/** Acquires the app's sole WebGPU device and render session. */
export async function createBrowserThreeWebGpuRenderSession(
  options: BrowserThreeWebGpuSessionOptions = {},
  dependencies: BrowserThreeWebGpuSessionDependencies = DEFAULT_DEPENDENCIES,
): Promise<BrowserThreeWebGpuRenderSession> {
  options.signal?.throwIfAborted();
  if (!dependencies.webGpuAvailable()) {
    throw new Error("WebGPU is required for the editor renderer.");
  }
  const adapter = await dependencies.requestAdapter({
    powerPreference: "high-performance",
    featureLevel: "core",
  });
  options.signal?.throwIfAborted();
  if (!adapter) throw new Error("No core WebGPU adapter is available.");
  const deviceProfile = compileThreeWebGpuDeviceCapabilityProfile(adapter, {
    gpuTimingEnabled: options.gpuTimingEnabled === true,
  });
  options.signal?.throwIfAborted();
  const device = await adapter.requestDevice({
    requiredFeatures: deviceProfile.requiredFeatures,
    requiredLimits: deviceProfile.requiredLimits,
  });
  const reportCleanupError = (error: unknown) => {
    try { options.onError?.(error); } catch { /* Teardown observers are contained. */ }
  };
  let deviceDestroyed = false;
  const destroyDevice = () => {
    if (deviceDestroyed) return;
    deviceDestroyed = true;
    try { device.destroy(); } catch (error) { reportCleanupError(error); }
  };
  if (options.signal?.aborted) {
    destroyDevice();
    options.signal.throwIfAborted();
  }
  let rendererFailureRequested = false;
  let requestOwnedDisposal: (() => Promise<void>) | null = null;
  let session: ThreeWebGpuRenderSession;
  try {
    session = dependencies.createSession({
      deviceScopeId: options.deviceScopeId ?? dependencies.createDeviceScopeId(),
      device,
      gpuTimingEnabled: deviceProfile.timestampQueries,
      maxEpochsInFlight: options.maxEpochsInFlight,
      rendererOptions: {
        antialias: false,
        powerPreference: "high-performance",
      },
      onError: options.onError,
      onRendererFailure: (diagnostic) => {
        rendererFailureRequested = true;
        const disposal = requestOwnedDisposal?.();
        if (disposal) void disposal.catch(reportCleanupError);
        try { options.onRendererFailure?.(diagnostic); } catch (error) {
          reportCleanupError(error);
        }
      },
    });
  } catch (error) {
    destroyDevice();
    throw error;
  }
  let disposed = false;
  let disposal: Promise<void> | null = null;
  let abortHandler: (() => void) | null = null;
  const disposeAsync = () => {
    if (disposal) return disposal;
    disposed = true;
    disposal = (async () => {
      try {
        await session.disposeAsync();
      } finally {
        if (abortHandler) {
          options.signal?.removeEventListener("abort", abortHandler);
          abortHandler = null;
        }
        destroyDevice();
      }
    })();
    return disposal;
  };
  let abortReady: Promise<never> | null = null;
  if (options.signal) {
    const signal = options.signal;
    abortReady = new Promise<never>((_resolve, reject) => {
      let handled = false;
      abortHandler = () => {
        if (handled) return;
        handled = true;
        const reason = signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
        const pendingDisposal = disposeAsync();
        void pendingDisposal.then(
          () => reject(reason),
          (error) => {
            reportCleanupError(error);
            reject(reason);
          },
        );
      };
      signal.addEventListener("abort", abortHandler, { once: true });
      if (signal.aborted) abortHandler();
    });
  }
  requestOwnedDisposal = disposeAsync;
  if (rendererFailureRequested) void disposeAsync().catch(reportCleanupError);
  const sessionReady = session.ready.catch(async (error) => {
    try { await disposeAsync(); } catch (disposalError) {
      reportCleanupError(disposalError);
    }
    throw error;
  });
  const ready = abortReady ? Promise.race([sessionReady, abortReady]) : sessionReady;
  return {
    ...session,
    deviceProfile,
    ready,
    dispose: () => {
      if (disposed) return;
      void disposeAsync().catch(reportCleanupError);
    },
    disposeAsync,
  };
}
