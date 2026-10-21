import type { FixedStepClock } from "../../runtime/fixed-step-clock";
import type { PhysicsPlaybackState } from "./physics-playback-state";

export type PhysicsPlaybackDiagnostics = {
  backend?: "impulse";
  status: "idle" | "waiting-for-device" | "initializing" | "running" | "error";
  bodyCount: number;
  maxPairs: number;
  maxManifolds: number;
  submittedStepId: number;
  completedStepId: number;
  appliedStepId: number;
  readbackLag: number;
  droppedSeconds: number;
  simulationPending: boolean;
  queuedSteps: number;
  estimatedStepMilliseconds: number;
  inFlightBatches: number;
  /** Bodies drawn through grouped instanced draws rather than per-object meshes. */
  instancedBodies: number;
  lastError?: string;
};

export const EMPTY_PHYSICS_PLAYBACK_DIAGNOSTICS: PhysicsPlaybackDiagnostics = {
  status: "idle",
  bodyCount: 0,
  maxPairs: 0,
  maxManifolds: 0,
  submittedStepId: 0,
  completedStepId: 0,
  appliedStepId: 0,
  readbackLag: 0,
  droppedSeconds: 0,
  simulationPending: false,
  queuedSteps: 0,
  estimatedStepMilliseconds: 0,
  inFlightBatches: 0,
  instancedBodies: 0,
};

export function diagnosticsForPhysicsPlayback(
  state: PhysicsPlaybackState,
  clock: FixedStepClock,
  droppedSeconds: number,
  admissionPending = false,
): PhysicsPlaybackDiagnostics {
  return {
    status: "running",
    backend: "impulse",
    bodyCount: state.runtime.bodySlots?.activeCount() ?? state.runtime.capacity.bodyCount,
    maxPairs: state.runtime.capacity.maxPairs,
    maxManifolds: state.runtime.capacity.maxManifolds,
    submittedStepId: state.submittedStepId,
    completedStepId: state.completedStepId,
    appliedStepId: state.appliedStepId,
    readbackLag: Math.max(0, state.completedStepId - state.appliedStepId),
    droppedSeconds,
    simulationPending: state.inFlightBatches > 0 || admissionPending,
    queuedSteps: clock.availableSteps,
    estimatedStepMilliseconds: state.stepDuration.stepMilliseconds,
    inFlightBatches: state.inFlightBatches,
    instancedBodies: state.views.instancedBodies(),
  };
}
