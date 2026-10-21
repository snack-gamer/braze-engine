import { rendererInitializationDiagnostic } from "../../three/device-lifecycle";
import type { ViewportRendererHandle } from "../../three/renderer";
import type { ThreeRendererFrameOwnership } from "./three-renderer-frame-ownership";
import { DEFAULT_THREE_WEBGPU_RENDER_HOST_DEPENDENCIES } from "./three-webgpu-render-host-dependencies";
import { createThreeWebGpuRenderSurfaceRegistry } from "./three-webgpu-render-surface-registry";
import { isPromiseLike } from "./three-webgpu-surface-contract";
import type {
  ThreeWebGpuRenderHost,
  ThreeWebGpuRenderHostDependencies,
  ThreeWebGpuRenderHostOptions,
  ThreeWebGpuRenderHostStatus,
  ThreeWebGpuRenderSubmission,
  ThreeWebGpuSubmissionContext,
} from "./three-webgpu-render-host-contract";

export type { ThreeWebGpuSurfaceSize } from "./three-webgpu-surface-contract";
export type {
  ThreeWebGpuRenderHost,
  ThreeWebGpuRenderHostDependencies,
  ThreeWebGpuRenderHostOptions,
  ThreeWebGpuRenderHostStatus,
  ThreeWebGpuRendererConfiguration,
  ThreeWebGpuRenderSubmission,
  ThreeWebGpuRenderSurface,
  ThreeWebGpuSubmissionContext,
} from "./three-webgpu-render-host-contract";

const DIRECT_HOST_CONTEXT: ThreeWebGpuSubmissionContext = Object.freeze({
  retirement: Promise.resolve<"completed">("completed"),
});

/**
 * Owns one Three WebGPU renderer and its independently sized CanvasTargets.
 * Registered canvases and an optionally supplied GPUDevice remain caller-owned.
 */
export function createThreeWebGpuRenderHost(
  options: ThreeWebGpuRenderHostOptions = {},
  dependencies: ThreeWebGpuRenderHostDependencies = DEFAULT_THREE_WEBGPU_RENDER_HOST_DEPENDENCIES,
): ThreeWebGpuRenderHost {
  let rendererHandle: ViewportRendererHandle;
  try {
    rendererHandle = dependencies.createRenderer(options.rendererOptions ?? {});
  } catch (error) {
    options.onFailure?.(rendererInitializationDiagnostic(error));
    throw error;
  }

  const { renderer } = rendererHandle;
  const bootstrapTarget = renderer.getCanvasTarget();
  let status: ThreeWebGpuRenderHostStatus = "initializing";
  let disposed = false;
  let initializationSettled = false;
  let rendererDisposed = false;
  let activeDeviceCallback = false;
  let frameOwnership: ThreeRendererFrameOwnership | null = null;
  let stopDeviceLossObservation: () => void = () => undefined;

  const reportError = (error: unknown) => {
    try { options.onError?.(error); } catch { /* Teardown observers are contained. */ }
  };

  const disposeRenderer = () => {
    if (rendererDisposed) return;
    rendererDisposed = true;
    try {
      renderer.dispose();
    } catch (error) {
      reportError(error);
    } finally {
      frameOwnership = null;
    }
  };

  let surfaceRegistry!: ReturnType<typeof createThreeWebGpuRenderSurfaceRegistry>;
  const maybeDisposeRenderer = () => {
    if (
      disposed
      && initializationSettled
      && !activeDeviceCallback
      && !surfaceRegistry.hasActiveCallback()
    ) disposeRenderer();
  };
  surfaceRegistry = createThreeWebGpuRenderSurfaceRegistry({
    renderer,
    bootstrapTarget,
    createCanvasTarget: dependencies.createCanvasTarget,
    getHostStatus: () => status,
    isDeviceCallbackActive: () => activeDeviceCallback,
    directHostContext: DIRECT_HOST_CONTEXT,
    onCallbackSettled: maybeDisposeRenderer,
    onError: reportError,
  });

  const ready = rendererHandle.ready
    .then(() => {
      initializationSettled = true;
      if (disposed) {
        disposeRenderer();
        return;
      }
      frameOwnership = dependencies.claimFrameOwnership(renderer);
      const device = dependencies.deviceFor(renderer);
      if (!device) throw new Error("WebGPU initialized without an accessible GPU device");
      stopDeviceLossObservation = dependencies.observeDeviceLoss(device, (diagnostic) => {
        if (disposed || status !== "ready") return;
        status = "device-lost";
        options.onFailure?.(diagnostic);
      });
      status = "ready";
    })
    .catch((error: unknown) => {
      initializationSettled = true;
      if (disposed) {
        disposeRenderer();
        return;
      }
      status = "failed";
      surfaceRegistry.releaseAll();
      disposeRenderer();
      options.onFailure?.(rendererInitializationDiagnostic(error));
      throw error;
    });

  // The host reports initialization through status/onFailure even when a caller
  // chooses not to await readiness. Awaiting `ready` still receives the rejection.
  void ready.catch(() => undefined);

  const execute = (
    callback: ThreeWebGpuRenderSubmission,
    context?: ThreeWebGpuSubmissionContext,
  ): boolean => {
    if (status !== "ready") return false;
    if (surfaceRegistry.hasActiveCallback() || activeDeviceCallback) {
      throw new Error("Render host callbacks must not be nested.");
    }
    activeDeviceCallback = true;
    renderer.setCanvasTarget(bootstrapTarget);
    try {
      const result: unknown = callback(renderer, context ?? DIRECT_HOST_CONTEXT);
      if (isPromiseLike(result)) {
        throw new Error("Render host callbacks must complete synchronously.");
      }
      return true;
    } finally {
      renderer.setCanvasTarget(bootstrapTarget);
      activeDeviceCallback = false;
      maybeDisposeRenderer();
    }
  };

  return {
    ready,
    getStatus: () => status,
    beginDeviceFrame: () => {
      if (status !== "initializing" && status !== "ready") return false;
      if (surfaceRegistry.hasActiveCallback() || activeDeviceCallback) {
        throw new Error("A device frame cannot begin during an active host callback.");
      }
      renderer.info.reset();
      frameOwnership?.advanceFrame();
      return true;
    },
    execute,
    registerSurface: surfaceRegistry.register,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      status = "disposed";
      try { stopDeviceLossObservation(); } catch (error) { reportError(error); }
      surfaceRegistry.releaseAll();
      maybeDisposeRenderer();
    },
  };
}
