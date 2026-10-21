import type {
  GpuPassSampleId,
  QueueEpochId,
  RafOpportunityId,
  RenderAttemptId,
  RenderSubmissionId,
  SimulationRevisionId,
} from "./render-timing-identities";
import type {
  GpuPassTelemetry,
  RenderAttemptTelemetry,
  RenderEncodeTelemetry,
  RetainedRenderAttemptTelemetry,
} from "./frame-telemetry-types";

export type RafSlot = {
  opportunityId: RafOpportunityId | null;
  timestampMilliseconds: number;
};

export type SimulationSlot = {
  revisionId: SimulationRevisionId | null;
  publishedAtMilliseconds: number;
};

export type AttemptSlot = {
  attemptId: RenderAttemptId | null;
  opportunityId: RafOpportunityId | null;
  simulationRevisionId: SimulationRevisionId | null;
  attemptedAtMilliseconds: number;
  status: "pending" | "submitted" | "rejected";
  submissionId: RenderSubmissionId | null;
  queueEpochId: QueueEpochId | null;
  submittedAtMilliseconds: number | null;
  retiredAtMilliseconds: number | null;
  rejectionReason: string | null;
};

export type EncodeSlot = {
  attemptId: RenderAttemptId | null;
  encodeStartedAtMilliseconds: number;
  encodeCompletedAtMilliseconds: number;
};

export type GpuPassSlot = {
  sampleId: GpuPassSampleId | null;
  submissionId: RenderSubmissionId | null;
  passId: string;
  durationMilliseconds: number;
};

export function emptyRafSlot(): RafSlot {
  return { opportunityId: null, timestampMilliseconds: 0 };
}

export function emptySimulationSlot(): SimulationSlot {
  return { revisionId: null, publishedAtMilliseconds: 0 };
}

export function emptyAttemptSlot(): AttemptSlot {
  return {
    attemptId: null,
    opportunityId: null,
    simulationRevisionId: null,
    attemptedAtMilliseconds: 0,
    status: "pending",
    submissionId: null,
    queueEpochId: null,
    submittedAtMilliseconds: null,
    retiredAtMilliseconds: null,
    rejectionReason: null,
  };
}

export function emptyEncodeSlot(): EncodeSlot {
  return { attemptId: null, encodeStartedAtMilliseconds: 0, encodeCompletedAtMilliseconds: 0 };
}

export function emptyGpuPassSlot(): GpuPassSlot {
  return { sampleId: null, submissionId: null, passId: "", durationMilliseconds: 0 };
}

export function writeAttemptSlot(slot: AttemptSlot, sample: RenderAttemptTelemetry): void {
  slot.attemptId = sample.attemptId;
  slot.opportunityId = sample.opportunityId;
  slot.simulationRevisionId = sample.simulationRevisionId;
  slot.attemptedAtMilliseconds = sample.attemptedAtMilliseconds;
  slot.status = "pending";
  slot.submissionId = null;
  slot.queueEpochId = null;
  slot.submittedAtMilliseconds = null;
  slot.retiredAtMilliseconds = null;
  slot.rejectionReason = null;
}

export function writeEncodeSlot(slot: EncodeSlot, sample: RenderEncodeTelemetry): void {
  slot.attemptId = sample.attemptId;
  slot.encodeStartedAtMilliseconds = sample.encodeStartedAtMilliseconds;
  slot.encodeCompletedAtMilliseconds = sample.encodeCompletedAtMilliseconds;
}

export function writeGpuPassSlot(slot: GpuPassSlot, sample: GpuPassTelemetry, passId: string): void {
  slot.sampleId = sample.sampleId;
  slot.submissionId = sample.submissionId;
  slot.passId = passId;
  slot.durationMilliseconds = sample.durationMilliseconds;
}

export function requirePendingAttempt(slot: AttemptSlot, attemptId: RenderAttemptId): void {
  if (slot.status !== "pending") throw new Error(`Render attempt ${attemptId} is already ${slot.status}.`);
}

export function copyAttempt(slot: AttemptSlot): RetainedRenderAttemptTelemetry {
  return {
    attemptId: slot.attemptId!,
    opportunityId: slot.opportunityId!,
    simulationRevisionId: slot.simulationRevisionId,
    attemptedAtMilliseconds: slot.attemptedAtMilliseconds,
    status: slot.status,
    submissionId: slot.submissionId,
    queueEpochId: slot.queueEpochId,
    submittedAtMilliseconds: slot.submittedAtMilliseconds,
    retiredAtMilliseconds: slot.retiredAtMilliseconds,
    rejectionReason: slot.rejectionReason,
  };
}
