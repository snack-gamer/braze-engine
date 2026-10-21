import type { CubeTexture, Renderer } from "three/webgpu";
import type {
  DeviceRenderOpportunity,
  ThreeWebGpuDeviceTaskLane,
  ThreeWebGpuRenderRequestDisposition,
} from "../../three-webgpu-render-session-contract";
import {
  createThreeReflectionProbeController,
  type ThreeReflectionProbeAdmissionPort,
  type ThreeReflectionProbeController,
  type ThreeReflectionProbeControllerOptions,
} from "./three-reflection-probe-controller";

export type ThreeReflectionProbeCaptureCompleted = Readonly<{
  generation: number;
  texture: CubeTexture;
}>;

export type ThreeReflectionProbeSessionLaneEvents = Readonly<{
  onCaptureCompleted?: (event: ThreeReflectionProbeCaptureCompleted) => void;
  onError?: (error: unknown) => void;
}>;

export type ThreeReflectionProbeSessionLaneOptions = Readonly<{
  lane: ThreeWebGpuDeviceTaskLane;
  controller?: ThreeReflectionProbeControllerOptions;
  events?: ThreeReflectionProbeSessionLaneEvents;
}>;

export type ThreeReflectionProbeSessionFlushDisposition =
  | ThreeWebGpuRenderRequestDisposition
  | "idle";

export type ThreeReflectionProbeSessionLane =
  Omit<ThreeReflectionProbeController, "dispose"> & Readonly<{
    laneName: string;
    flush: (
      opportunity: DeviceRenderOpportunity,
    ) => ThreeReflectionProbeSessionFlushDisposition;
    hasPendingAdmission: () => boolean;
    dispose: () => void;
  }>;

export type ThreeReflectionProbeSessionLaneDependencies = Readonly<{
  createController: (
    admission: ThreeReflectionProbeAdmissionPort,
    options: ThreeReflectionProbeControllerOptions,
  ) => ThreeReflectionProbeController;
}>;

type PendingCapture = {
  capture: (renderer: Renderer) => void;
  ownership: "local" | "lane" | "submitting";
};

const DEFAULT_DEPENDENCIES: ThreeReflectionProbeSessionLaneDependencies = {
  createController: createThreeReflectionProbeController,
};

/** Owns a probe controller and transfers its synchronous captures into one device task lane. */
export function createThreeReflectionProbeSessionLane(
  options: ThreeReflectionProbeSessionLaneOptions,
  dependencies: ThreeReflectionProbeSessionLaneDependencies = DEFAULT_DEPENDENCIES,
): ThreeReflectionProbeSessionLane {
  const { lane, events } = options;
  let pendingCapture: PendingCapture | null = null;
  let disposed = false;
  let controller: ThreeReflectionProbeController;

  const notifyError = (error: unknown): void => {
    try {
      events?.onError?.(error);
    } catch {
      // Diagnostic observers cannot interrupt device-task ownership.
    }
  };

  const admission: ThreeReflectionProbeAdmissionPort = {
    request: (capture) => {
      if (disposed) return "rejected";
      pendingCapture = { capture, ownership: "local" };
      return "queued";
    },
  };

  try {
    controller = dependencies.createController(admission, options.controller ?? {});
  } catch (error) {
    lane.dispose();
    throw error;
  }

  const flush = (
    opportunity: DeviceRenderOpportunity,
  ): ThreeReflectionProbeSessionFlushDisposition => {
    if (disposed) return "rejected";
    const pending = pendingCapture;
    if (!pending) return "idle";
    if (pending.ownership === "lane") return "queued";
    pending.ownership = "submitting";
    let captureError: unknown;
    let captureFailed = false;

    const execute = (renderer: Renderer): void => {
      if (disposed || pendingCapture !== pending) return;
      pendingCapture = null;
      const generationBefore = controller.getGeneration();
      try {
        pending.capture(renderer);
      } catch (error) {
        captureFailed = true;
        captureError = error;
        notifyError(error);
        if (!disposed) controller.retryPendingAdmission();
        throw error;
      }
      if (disposed) return;
      const generation = controller.getGeneration();
      if (generation <= generationBefore) return;
      try {
        events?.onCaptureCompleted?.({
          generation,
          texture: controller.getTexture(),
        });
      } catch (error) {
        notifyError(error);
      }
    };

    try {
      const disposition = lane.request(opportunity, execute);
      if (pendingCapture === pending) {
        pending.ownership = disposition === "queued" ? "lane" : "local";
      }
      return disposition;
    } catch (error) {
      if (pendingCapture === pending) pending.ownership = "local";
      if (!captureFailed || captureError !== error) notifyError(error);
      return "rejected";
    }
  };

  return {
    laneName: lane.name,
    invalidate: controller.invalidate,
    retryPendingAdmission: controller.retryPendingAdmission,
    getTexture: controller.getTexture,
    getStatus: controller.getStatus,
    getGeneration: controller.getGeneration,
    flush,
    hasPendingAdmission: () => pendingCapture !== null && !disposed,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      pendingCapture = null;
      try {
        controller.dispose();
      } finally {
        lane.dispose();
      }
    },
  };
}
