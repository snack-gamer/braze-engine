import type {
  GpuPassSampleId,
  QueueEpochId,
  RafOpportunityId,
  RenderAttemptId,
  RenderSubmissionId,
  SimulationRevisionId,
} from "./render-timing-identities";
import type { FrameTelemetryRetentionDiagnostics } from "./frame-telemetry-types";
import type { AttemptSlot } from "./frame-telemetry-slots";

/** Bounded correlation indexes and retention diagnostics owned by the telemetry rings. */
export class FrameTelemetryIndexes {
  readonly raf = new Set<RafOpportunityId>();
  readonly simulation = new Set<SimulationRevisionId>();
  readonly attempt = new Map<RenderAttemptId, number>();
  readonly submission = new Map<RenderSubmissionId, number>();
  readonly epoch = new Map<QueueEpochId, number>();
  readonly gpuPass = new Map<GpuPassSampleId, number>();
  readonly encode = new Map<RenderAttemptId, number>();
  private droppedGpuPassSamples = 0;
  private unmatchedQueueRetirements = 0;
  private evictedPendingAttempts = 0;

  releaseAttempt(slot: AttemptSlot): void {
    if (slot.attemptId === null) return;
    this.attempt.delete(slot.attemptId);
    this.encode.delete(slot.attemptId);
    if (slot.status === "pending") this.evictedPendingAttempts += 1;
    if (slot.submissionId !== null) this.submission.delete(slot.submissionId);
    if (slot.queueEpochId !== null) this.epoch.delete(slot.queueEpochId);
  }

  countDroppedGpuPassSample(): void {
    this.droppedGpuPassSamples += 1;
  }

  countUnmatchedQueueRetirement(): void {
    this.unmatchedQueueRetirements += 1;
  }

  diagnostics(): FrameTelemetryRetentionDiagnostics {
    return {
      droppedGpuPassSamples: this.droppedGpuPassSamples,
      unmatchedQueueRetirements: this.unmatchedQueueRetirements,
      evictedPendingAttempts: this.evictedPendingAttempts,
    };
  }
}
