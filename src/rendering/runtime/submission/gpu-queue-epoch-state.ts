import type {
  QueueEpochId,
  RenderAttemptId,
  RenderSubmissionId,
} from "../telemetry/render-timing-identities";
import type { GpuQueueEpochSubmitted } from "./gpu-queue-epoch-events";

export type GpuQueueEpochState = {
  attemptId: RenderAttemptId;
  submissionId: RenderSubmissionId | null;
  queueEpochId: QueueEpochId;
  generation: number;
  status: "reserved" | "submitted";
  submittedAtMilliseconds: number;
};

export function createGpuQueueEpochState(
  attemptId: RenderAttemptId,
  queueEpochId: QueueEpochId,
  generation: number,
): GpuQueueEpochState {
  return {
    attemptId,
    submissionId: null,
    queueEpochId,
    generation,
    status: "reserved",
    submittedAtMilliseconds: 0,
  };
}

export function gpuQueueEpochSubmittedEvent(state: GpuQueueEpochState): GpuQueueEpochSubmitted {
  return {
    attemptId: state.attemptId,
    submissionId: state.submissionId!,
    queueEpochId: state.queueEpochId,
    submittedAtMilliseconds: state.submittedAtMilliseconds,
  };
}
