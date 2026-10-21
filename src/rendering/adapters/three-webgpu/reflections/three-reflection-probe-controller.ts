import type { CubeTexture, Renderer, Scene } from "three/webgpu";
import {
  createThreeReflectionProbeCaptureTarget,
  type ThreeReflectionProbeCaptureTarget,
  type ThreeReflectionProbeCaptureTargetOptions,
  type ThreeReflectionProbePosition,
} from "./three-reflection-probe-capture-target";

const MAX_GENERATION = Number.MAX_SAFE_INTEGER;

export type ThreeReflectionProbeAdmissionDisposition = "submitted" | "queued" | "rejected";

export type ThreeReflectionProbeAdmissionPort = Readonly<{
  request: (
    capture: (renderer: Renderer) => void,
  ) => ThreeReflectionProbeAdmissionDisposition;
}>;

export type ThreeReflectionProbeInvalidation = Readonly<{
  scene: Scene;
  position: ThreeReflectionProbePosition;
}>;

export type ThreeReflectionProbePhase =
  | "idle"
  | "pending"
  | "scheduled"
  | "capturing"
  | "captured"
  | "failed"
  | "disposed";

export type ThreeReflectionProbeStatus = Readonly<{
  phase: ThreeReflectionProbePhase;
  requestedGeneration: number;
  textureGeneration: number;
  pending: boolean;
}>;

export type ThreeReflectionProbeController = Readonly<{
  invalidate: (
    invalidation: ThreeReflectionProbeInvalidation,
  ) => ThreeReflectionProbeAdmissionDisposition;
  retryPendingAdmission: () => ThreeReflectionProbeAdmissionDisposition;
  getTexture: () => CubeTexture;
  getStatus: () => ThreeReflectionProbeStatus;
  getGeneration: () => number;
  dispose: () => void;
}>;

export type ThreeReflectionProbeControllerOptions = ThreeReflectionProbeCaptureTargetOptions;

export type ThreeReflectionProbeControllerDependencies = Readonly<{
  createCaptureTarget: (
    options: ThreeReflectionProbeCaptureTargetOptions,
  ) => ThreeReflectionProbeCaptureTarget;
}>;

const DEFAULT_DEPENDENCIES: ThreeReflectionProbeControllerDependencies = {
  createCaptureTarget: createThreeReflectionProbeCaptureTarget,
};

/** Coalesces invalidations and captures only when its admission callback is invoked. */
export function createThreeReflectionProbeController(
  admission: ThreeReflectionProbeAdmissionPort,
  options: ThreeReflectionProbeControllerOptions = {},
  dependencies: ThreeReflectionProbeControllerDependencies = DEFAULT_DEPENDENCIES,
): ThreeReflectionProbeController {
  const target = dependencies.createCaptureTarget(options);
  let phase: ThreeReflectionProbePhase = "idle";
  let requestedGeneration = 0;
  let textureGeneration = 0;
  let scene: Scene | null = null;
  const position = { x: 0, y: 0, z: 0 };
  let pending = false;
  let admissionOutstanding = false;
  let capturing = false;
  let disposed = false;
  let targetDisposed = false;

  const disposeTargetOnce = () => {
    if (targetDisposed) return;
    targetDisposed = true;
    target.dispose();
  };

  const requestAdmission = (): ThreeReflectionProbeAdmissionDisposition => {
    if (disposed || !pending) return "rejected";
    if (admissionOutstanding) return "queued";
    admissionOutstanding = true;
    phase = "scheduled";
    try {
      const disposition = admission.request(captureAdmitted);
      if (disposition === "rejected" && admissionOutstanding) {
        admissionOutstanding = false;
        phase = "pending";
      }
      return disposition;
    } catch (error) {
      if (admissionOutstanding) {
        admissionOutstanding = false;
        phase = "failed";
      }
      throw error;
    }
  };

  const captureAdmitted = (renderer: Renderer): void => {
    if (!admissionOutstanding) return;
    if (disposed) {
      admissionOutstanding = false;
      return;
    }
    const captureGeneration = requestedGeneration;
    const captureScene = scene!;
    const capturePosition = { ...position };
    let captureSucceeded = false;
    capturing = true;
    phase = "capturing";
    try {
      target.capture(renderer, captureScene, capturePosition);
      textureGeneration = captureGeneration;
      captureSucceeded = true;
      if (!disposed) {
        if (requestedGeneration === captureGeneration) pending = false;
        phase = pending ? "pending" : "captured";
      }
    } catch (error) {
      if (!disposed) phase = "failed";
      throw error;
    } finally {
      capturing = false;
      admissionOutstanding = false;
      if (disposed) disposeTargetOnce();
    }
    if (captureSucceeded && pending && !disposed) requestAdmission();
  };

  return {
    invalidate(invalidation) {
      if (disposed) return "rejected";
      validatePosition(invalidation.position);
      if (requestedGeneration === MAX_GENERATION) {
        throw new Error("Reflection probe generation exhausted its safe integer range.");
      }
      requestedGeneration += 1;
      scene = invalidation.scene;
      position.x = invalidation.position.x;
      position.y = invalidation.position.y;
      position.z = invalidation.position.z;
      pending = true;
      if (!admissionOutstanding) phase = "pending";
      return requestAdmission();
    },
    retryPendingAdmission: requestAdmission,
    getTexture: target.getTexture,
    getStatus: () => Object.freeze({
      phase,
      requestedGeneration,
      textureGeneration,
      pending: pending && !disposed,
    }),
    getGeneration: () => textureGeneration,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      pending = false;
      scene = null;
      phase = "disposed";
      if (!capturing) disposeTargetOnce();
    },
  };
}

function validatePosition(position: ThreeReflectionProbePosition): void {
  if (!Number.isFinite(position.x)
    || !Number.isFinite(position.y)
    || !Number.isFinite(position.z)) {
    throw new Error("Reflection probe position must contain finite coordinates.");
  }
}
