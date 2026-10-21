import type { PhysicsPlaybackDiagnostics } from "./physics/playback-controller";

const PHYSICS_SAMPLE_INTERVAL_MS = 250;

type DiagnosticHost = Pick<HTMLElement, "dataset">;

export type ViewportDiagnostics = Readonly<{
  markRenderSubmitted: () => void;
  publishPhysics: (now: number, diagnostics: PhysicsPlaybackDiagnostics) => void;
  setRendererStatus: (status: "ready" | "failed" | "device-lost") => void;
  setRenderLoopActive: (active: boolean) => void;
  dispose: () => void;
}>;

/** Owns the observable viewport data attributes and throttled physics status. */
export function createViewportDiagnostics(host: DiagnosticHost): ViewportDiagnostics {
  let submittedRenderCount = 0;
  let lastPhysicsKey = "";
  let lastPhysicsPublishAt = Number.NEGATIVE_INFINITY;
  host.dataset.renderCount = "0";

  return {
    markRenderSubmitted: () => {
      submittedRenderCount += 1;
      host.dataset.renderCount = String(submittedRenderCount);
    },
    publishPhysics: (now, diagnostics) => {
      if (now - lastPhysicsPublishAt < PHYSICS_SAMPLE_INTERVAL_MS) return;
      lastPhysicsPublishAt = now;
      const key = [
        diagnostics.status,
        diagnostics.backend ?? "",
        diagnostics.lastError ?? "",
        diagnostics.bodyCount,
        diagnostics.simulationPending ? 1 : 0,
        diagnostics.queuedSteps,
        diagnostics.completedStepId,
        diagnostics.appliedStepId,
        diagnostics.droppedSeconds.toFixed(4),
        diagnostics.estimatedStepMilliseconds.toFixed(2),
      ].join(":");
      if (key === lastPhysicsKey) return;
      lastPhysicsKey = key;
      host.dataset.physicsStatus = diagnostics.status;
      host.dataset.physicsBackend = diagnostics.backend ?? "";
      host.dataset.physicsError = diagnostics.lastError ?? "";
      host.dataset.physicsBodies = String(diagnostics.bodyCount);
      host.dataset.physicsPending = String(diagnostics.simulationPending);
      host.dataset.physicsQueuedSteps = String(diagnostics.queuedSteps);
      host.dataset.physicsCompletedStep = String(diagnostics.completedStepId);
      host.dataset.physicsAppliedStep = String(diagnostics.appliedStepId);
      host.dataset.physicsDroppedSeconds = diagnostics.droppedSeconds.toFixed(4);
      host.dataset.physicsStepMs = diagnostics.estimatedStepMilliseconds.toFixed(2);
      host.dataset.physicsInstanced = String(diagnostics.instancedBodies);
    },
    setRendererStatus: (status) => {
      host.dataset.rendererStatus = status;
    },
    setRenderLoopActive: (active) => {
      host.dataset.renderLoop = active ? "active" : "idle";
    },
    dispose: () => {
      delete host.dataset.physicsStatus;
      delete host.dataset.physicsBackend;
      delete host.dataset.physicsError;
      delete host.dataset.physicsBodies;
      delete host.dataset.physicsPending;
      delete host.dataset.physicsQueuedSteps;
      delete host.dataset.physicsCompletedStep;
      delete host.dataset.physicsAppliedStep;
      delete host.dataset.physicsDroppedSeconds;
      delete host.dataset.physicsStepMs;
      delete host.dataset.physicsInstanced;
      delete host.dataset.renderCount;
      delete host.dataset.renderLoop;
      delete host.dataset.rendererStatus;
    },
  };
}
