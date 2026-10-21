import type { RenderAttemptId, RenderSubmissionId } from "../telemetry/render-timing-identities";
import type { QueueEpochId } from "../telemetry/render-timing-identities";
import type { GpuQueueEpochGovernorEvents } from "./gpu-queue-epoch-events";

export type GpuQueueRetirementPort = Readonly<{
  onSubmittedWorkDone: () => PromiseLike<void>;
}>;

export type GpuQueueEpochLease = Readonly<{
  attemptId: RenderAttemptId;
  queueEpochId: QueueEpochId;
  submit: (submissionId: RenderSubmissionId) => Promise<GpuQueueEpochRetirement>;
  cancel: () => void;
}>;

export type GpuQueueEpochRetirement = "completed" | "failed";

export type RenderAdmissionOffer =
  | Readonly<{
      disposition: "admitted";
      lease: GpuQueueEpochLease;
      supersededPendingAttemptId: RenderAttemptId | null;
    }>
  | Readonly<{
      disposition: "pending";
      supersededPendingAttemptId: RenderAttemptId | null;
    }>
  | Readonly<{
      disposition: "rejected";
      reason: "disposed";
    }>;

export type GpuQueueEpochGovernorOptions = Readonly<{
  maxEpochsInFlight?: number;
  clockMilliseconds?: () => number;
  events?: GpuQueueEpochGovernorEvents;
  reportObserverError?: (error: unknown) => void;
}>;
