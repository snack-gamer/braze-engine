import type { CanvasTarget } from "three/webgpu";
import type { ViewportRenderer } from "../../three/renderer";
import {
  isPromiseLike,
  validateThreeWebGpuSurfaceSize,
} from "./three-webgpu-surface-contract";
import type {
  ThreeWebGpuRenderHostDependencies,
  ThreeWebGpuRenderHostStatus,
  ThreeWebGpuRendererConfiguration,
  ThreeWebGpuRenderSurface,
  ThreeWebGpuSubmissionContext,
} from "./three-webgpu-render-host-contract";

type SurfaceRecord = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  target: CanvasTarget;
  released: boolean;
  disposeAfterSubmission: boolean;
};

type SurfaceRegistryArgs = Readonly<{
  renderer: ViewportRenderer;
  bootstrapTarget: CanvasTarget;
  createCanvasTarget: ThreeWebGpuRenderHostDependencies["createCanvasTarget"];
  getHostStatus: () => ThreeWebGpuRenderHostStatus;
  isDeviceCallbackActive: () => boolean;
  directHostContext: ThreeWebGpuSubmissionContext;
  onCallbackSettled: () => void;
  onError: (error: unknown) => void;
}>;

export type ThreeWebGpuRenderSurfaceRegistry = Readonly<{
  hasActiveCallback: () => boolean;
  register: (canvas: HTMLCanvasElement | OffscreenCanvas) => ThreeWebGpuRenderSurface;
  releaseAll: () => void;
}>;

/** Owns CanvasTarget selection, serialization, sizing, and release for host surfaces. */
export function createThreeWebGpuRenderSurfaceRegistry({
  renderer,
  bootstrapTarget,
  createCanvasTarget,
  getHostStatus,
  isDeviceCallbackActive,
  directHostContext,
  onCallbackSettled,
  onError,
}: SurfaceRegistryArgs): ThreeWebGpuRenderSurfaceRegistry {
  const surfaces = new Map<HTMLCanvasElement | OffscreenCanvas, SurfaceRecord>();
  let activeCallback: SurfaceRecord | null = null;

  const useTarget = <T>(record: SurfaceRecord, operation: () => T): T => {
    renderer.setCanvasTarget(record.target);
    try {
      return operation();
    } finally {
      renderer.setCanvasTarget(bootstrapTarget);
    }
  };
  const disposeTarget = (record: SurfaceRecord) => {
    if (renderer.getCanvasTarget() === record.target) renderer.setCanvasTarget(bootstrapTarget);
    record.target.dispose();
  };
  const disposeTargetSafely = (record: SurfaceRecord) => {
    try { disposeTarget(record); } catch (error) { onError(error); }
  };
  const release = (record: SurfaceRecord) => {
    if (record.released) return;
    record.released = true;
    surfaces.delete(record.canvas);
    if (activeCallback === record) {
      record.disposeAfterSubmission = true;
      return;
    }
    disposeTargetSafely(record);
  };
  const invoke = (
    record: SurfaceRecord,
    callback: ThreeWebGpuRendererConfiguration,
    allowed: boolean,
  ): boolean => {
    if (record.released || !allowed) return false;
    if (activeCallback || isDeviceCallbackActive()) {
      throw new Error("Render host callbacks must not be nested.");
    }
    activeCallback = record;
    try {
      const result: unknown = useTarget(record, () => callback(renderer));
      if (isPromiseLike(result)) {
        throw new Error("Render host surface callbacks must complete synchronously.");
      }
      return true;
    } finally {
      activeCallback = null;
      try {
        if (record.disposeAfterSubmission) disposeTargetSafely(record);
      } finally {
        onCallbackSettled();
      }
    }
  };

  return Object.freeze({
    hasActiveCallback: () => activeCallback !== null,
    register: (canvas) => {
      const status = getHostStatus();
      if (status === "disposed" || status === "failed" || status === "device-lost") {
        throw new Error(`Cannot register a render surface while the host is ${status}.`);
      }
      if (surfaces.has(canvas)) {
        throw new Error("This canvas is already registered with the render host.");
      }
      const record: SurfaceRecord = {
        canvas,
        target: createCanvasTarget(canvas),
        released: false,
        disposeAfterSubmission: false,
      };
      surfaces.set(canvas, record);
      return {
        configure: (configuration) => invoke(
          record,
          configuration,
          getHostStatus() === "initializing" || getHostStatus() === "ready",
        ),
        render: (submission, context) => invoke(
          record,
          (activeRenderer) => submission(activeRenderer, context ?? directHostContext),
          getHostStatus() === "ready",
        ),
        resize: (size) => {
          const currentStatus = getHostStatus();
          if (
            record.released
            || (currentStatus !== "initializing" && currentStatus !== "ready")
          ) return false;
          if (activeCallback || isDeviceCallbackActive()) {
            throw new Error("Render surfaces cannot be resized during an active host callback.");
          }
          validateThreeWebGpuSurfaceSize(size);
          useTarget(record, () => {
            record.target.setDrawingBufferSize(size.width, size.height, size.pixelRatio);
          });
          return true;
        },
        dispose: () => release(record),
      };
    },
    releaseAll: () => {
      for (const record of surfaces.values()) release(record);
    },
  });
}
