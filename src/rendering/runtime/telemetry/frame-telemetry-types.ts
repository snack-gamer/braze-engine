import type {
  GpuPassSampleId,
  QueueEpochId,
  RafOpportunityId,
  RenderAttemptId,
  RenderSubmissionId,
  SimulationRevisionId,
} from "./render-timing-identities";

export type RafOpportunityTelemetry = Readonly<{
  opportunityId: RafOpportunityId;
  timestampMilliseconds: number;
}>;

export type SimulationRevisionTelemetry = Readonly<{
  revisionId: SimulationRevisionId;
  publishedAtMilliseconds: number;
}>;

export type RenderAttemptTelemetry = Readonly<{
  attemptId: RenderAttemptId;
  opportunityId: RafOpportunityId;
  simulationRevisionId: SimulationRevisionId | null;
  attemptedAtMilliseconds: number;
}>;

export type RenderSubmissionTelemetry = Readonly<{
  attemptId: RenderAttemptId;
  submissionId: RenderSubmissionId;
  queueEpochId: QueueEpochId;
  submittedAtMilliseconds: number;
}>;

export type RenderEncodeTelemetry = Readonly<{
  attemptId: RenderAttemptId;
  encodeStartedAtMilliseconds: number;
  encodeCompletedAtMilliseconds: number;
}>;

export type RenderRejectionTelemetry = Readonly<{
  attemptId: RenderAttemptId;
  reason: string;
}>;

export type QueueRetirementTelemetry = Readonly<{
  queueEpochId: QueueEpochId;
  retiredAtMilliseconds: number;
}>;

export type GpuPassTelemetry = Readonly<{
  sampleId: GpuPassSampleId;
  submissionId: RenderSubmissionId;
  passId: string;
  durationMilliseconds: number;
}>;

export type RetainedRenderAttemptTelemetry = Readonly<{
  attemptId: RenderAttemptId;
  opportunityId: RafOpportunityId;
  simulationRevisionId: SimulationRevisionId | null;
  attemptedAtMilliseconds: number;
  status: "pending" | "submitted" | "rejected";
  submissionId: RenderSubmissionId | null;
  queueEpochId: QueueEpochId | null;
  submittedAtMilliseconds: number | null;
  retiredAtMilliseconds: number | null;
  rejectionReason: string | null;
}>;

export type RetainedGpuPassTelemetry = GpuPassTelemetry;

export type RetainedRenderEncodeTelemetry = RenderEncodeTelemetry;

export type FrameTelemetryRetentionDiagnostics = Readonly<{
  droppedGpuPassSamples: number;
  unmatchedQueueRetirements: number;
  evictedPendingAttempts: number;
}>;
