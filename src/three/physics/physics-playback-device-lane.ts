import type { Renderer } from "three/webgpu";
import type { PhysicsPlaybackSolver } from "./playback-backend";
import type {
  DeviceRenderOpportunity,
  ThreeWebGpuDeviceTaskLane,
  ThreeWebGpuRenderRequestDisposition,
} from "../../rendering/adapters/three-webgpu-render-session-contract";
import type { ThreeWebGpuSubmissionContext } from "../../rendering/adapters/three-webgpu-render-host";

type PhysicsRuntimeSubmission = Pick<PhysicsPlaybackSolver, "runRigidSolverBatch" | "retainUntil">;

export type PhysicsPlaybackDeviceWork =
  | Readonly<{
      kind: "operation";
      execute: (renderer: Renderer, context: ThreeWebGpuSubmissionContext) => void;
    }>
  | Readonly<{
      kind: "solver-batch";
      runtime: PhysicsRuntimeSubmission;
      stepCount: number;
      beforeSubmit: () => void;
      beforeStep?: (offset: number) => boolean;
      onSubmitted: (stepCount: number) => void;
      onCompleted: (durationMilliseconds: number) => void;
      onSettled: () => void;
      onError: (error: unknown) => void;
    }>;

export type PhysicsPlaybackDeviceWorkSelector = (
  renderer: Renderer,
) => PhysicsPlaybackDeviceWork | null;

export type PhysicsPlaybackDeviceLane = Readonly<{
  request: (
    opportunity: DeviceRenderOpportunity,
    selectWork: PhysicsPlaybackDeviceWorkSelector,
  ) => ThreeWebGpuRenderRequestDisposition;
  hasPendingAdmission: () => boolean;
  dispose: () => void;
}>;

type PendingAdmission = {
  selectWork: PhysicsPlaybackDeviceWorkSelector;
};

/** Admits physics work through one latest-wins device lane and tracks queue completion only. */
export function createPhysicsPlaybackDeviceLane(
  lane: ThreeWebGpuDeviceTaskLane,
  clockMilliseconds: () => number = () => performance.now(),
): PhysicsPlaybackDeviceLane {
  let pending: PendingAdmission | null = null;
  let disposed = false;

  const executeSolverBatch = (
    work: Extract<PhysicsPlaybackDeviceWork, { kind: "solver-batch" }>,
    context: ThreeWebGpuSubmissionContext,
  ): void => {
    if (!Number.isInteger(work.stepCount) || work.stepCount <= 0) {
      throw new Error("A physics device batch requires a positive integer step count.");
    }
    const startedAt = clockMilliseconds();
    let submitted = 0;
    try {
      work.beforeSubmit();
      if (work.beforeStep) {
        for (let offset = 0; offset < work.stepCount; offset += 1) {
          if (!work.beforeStep(offset)) break;
          // Queue writes must precede their own submission. Encoding all ticks
          // after all callbacks would collapse sparse kinematic targets again.
          work.runtime.runRigidSolverBatch(1);
          submitted += 1;
        }
      } else {
        work.runtime.runRigidSolverBatch(work.stepCount);
        submitted = work.stepCount;
      }
    } catch (error) {
      notify(() => work.onError(error));
      throw error;
    } finally {
      work.runtime.retainUntil?.(context.retirement);
      if (submitted > 0) {
        notify(() => work.onSubmitted(submitted));
        void context.retirement
          .then((status) => {
            if (status === "completed") {
              notify(() => work.onCompleted(clockMilliseconds() - startedAt));
            } else if (status === "failed") {
              notify(() => work.onError(new Error("The governed physics queue epoch failed to retire.")));
            }
          })
          // Completion is backpressure/telemetry, never a simulation dependency.
          .finally(() => notify(work.onSettled));
      }
    }
  };

  const executePending = (
    admission: PendingAdmission,
    renderer: Renderer,
    context: ThreeWebGpuSubmissionContext,
  ): void => {
    if (disposed || pending !== admission) return;
    pending = null;
    const work = admission.selectWork(renderer);
    if (!work) return;
    if (work.kind === "operation") {
      work.execute(renderer, context);
      return;
    }
    executeSolverBatch(work, context);
  };

  return {
    request(opportunity, selectWork) {
      if (disposed) return "rejected";
      if (pending) {
        // Do not enqueue another lane item. The admitted callback observes the
        // newest playback state while the session retains one fair-queue slot.
        pending.selectWork = selectWork;
        return "queued";
      }
      const admission: PendingAdmission = { selectWork };
      pending = admission;
      let disposition: ThreeWebGpuRenderRequestDisposition;
      try {
        disposition = lane.request(
          opportunity,
          (renderer, context) => {
            if (!context) throw new Error("physics device work requires a governed retirement signal.");
            executePending(admission, renderer, context);
          },
        );
      } catch (error) {
        if (pending === admission) pending = null;
        throw error;
      }
      if (disposition === "rejected" && pending === admission) pending = null;
      return disposition;
    },
    hasPendingAdmission: () => pending !== null && !disposed,
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = null;
      lane.dispose();
    },
  };
}

function notify(callback: () => void): void {
  try {
    callback();
  } catch {
    // Playback observers cannot break device-task ownership or completion cleanup.
  }
}
