import type { SurfaceAdmissionLane } from "../runtime/submission/fair-surface-admission-coordinator";
import type { RafOpportunityId, RenderAttemptId } from "../runtime/telemetry/render-timing-identities";
import type {
  ThreeWebGpuRenderSubmission,
  ThreeWebGpuSubmissionContext,
} from "./three-webgpu-render-host";
import type { ThreeWebGpuSurfaceSubmissionObserver } from "./three-webgpu-session-admission-contract";

export type ThreeWebGpuAdmissionLaneState = {
  name: string;
  execute: (
    submission: ThreeWebGpuRenderSubmission,
    context: ThreeWebGpuSubmissionContext,
  ) => boolean;
  observeSurfaceSubmission: ThreeWebGpuSurfaceSubmissionObserver | null;
  coordinatorLane: SurfaceAdmissionLane<ThreeWebGpuPendingWork>;
  disposed: boolean;
};

export type ThreeWebGpuPendingWork = {
  attemptId: RenderAttemptId;
  opportunityId: RafOpportunityId;
  lane: ThreeWebGpuAdmissionLaneState;
  submission: ThreeWebGpuRenderSubmission;
};
