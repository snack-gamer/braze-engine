import type {
  QueueEpochId,
  RenderAttemptId,
  RenderSubmissionId,
} from "../telemetry/render-timing-identities";

export type GpuQueueEpochSubmitted = Readonly<{
  attemptId: RenderAttemptId;
  submissionId: RenderSubmissionId;
  queueEpochId: QueueEpochId;
  submittedAtMilliseconds: number;
}>;

export type GpuQueueEpochRetired = GpuQueueEpochSubmitted & Readonly<{
  completion: "completed" | "failed";
  retiredAtMilliseconds: number;
}>;

export type GpuQueueEpochAbandoned = Readonly<{
  attemptId: RenderAttemptId;
  submissionId: RenderSubmissionId | null;
  queueEpochId: QueueEpochId;
  reason: "cancelled" | "disposed";
}>;

export type GpuQueueEpochGovernorEvents = Readonly<{
  onEpochSubmitted?: (event: GpuQueueEpochSubmitted) => void;
  onEpochRetired?: (event: GpuQueueEpochRetired) => void;
  onEpochAbandoned?: (event: GpuQueueEpochAbandoned) => void;
  onPendingAttemptDiscarded?: (
    attemptId: RenderAttemptId,
    reason: "superseded" | "disposed",
  ) => void;
}>;

/** Isolates diagnostic observers from queue ownership and retirement settlement. */
export class GpuQueueEpochEventDispatcher {
  constructor(
    private readonly events: GpuQueueEpochGovernorEvents,
    private readonly reportObserverError: (error: unknown) => void,
  ) {}

  epochSubmitted(event: GpuQueueEpochSubmitted): void {
    try {
      this.events.onEpochSubmitted?.(event);
    } catch (error) {
      this.observerError(error);
    }
  }

  epochRetired(event: GpuQueueEpochRetired): void {
    try {
      this.events.onEpochRetired?.(event);
    } catch (error) {
      this.observerError(error);
    }
  }

  epochAbandoned(event: GpuQueueEpochAbandoned): void {
    try {
      this.events.onEpochAbandoned?.(event);
    } catch (error) {
      this.observerError(error);
    }
  }

  pendingAttemptDiscarded(
    attemptId: RenderAttemptId,
    reason: "superseded" | "disposed",
  ): void {
    try {
      this.events.onPendingAttemptDiscarded?.(attemptId, reason);
    } catch (error) {
      this.observerError(error);
    }
  }

  private observerError(error: unknown): void {
    try {
      this.reportObserverError(error);
    } catch {
      // Diagnostic observers cannot stop queue ownership from settling.
    }
  }
}
