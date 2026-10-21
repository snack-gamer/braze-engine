import type { RootMotionApplication, RootMotionSink } from "../../character/runtime/root-motion";

const IDLE_DIAGNOSTICS = Object.freeze({
  status: "idle" as const,
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
});
const ROOT_MOTION_SINK: RootMotionSink = Object.freeze({
  applyRootMotion: (_application: RootMotionApplication) => undefined,
});

export function physicsWorldForSession(_session: unknown) { return null; }

export function retainPhysicsWorld(_session: unknown): never {
  throw new Error("This player was built without physics; rebuild after adding physics components.");
}

/** Compile-time player topology for scenes with no enabled physics components. */
export function createPhysicsViewportPlayback(_session: unknown) {
  return {
    prepare: (_runtime: unknown) => undefined,
    present: (_args: unknown) => false,
    schedule: (_args: unknown) => false,
    hasPendingAdmission: () => false,
    hasPendingDeviceWork: () => false,
    diagnostics: () => IDLE_DIAGNOSTICS,
    characterMotorFor: (_objectId: string) => ROOT_MOTION_SINK,
    dispose: () => undefined,
  };
}
