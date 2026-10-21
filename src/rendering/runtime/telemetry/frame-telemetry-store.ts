import type { RenderAttemptId } from "./render-timing-identities";
import type {
  FrameTelemetryRetentionDiagnostics,
  GpuPassTelemetry,
  QueueRetirementTelemetry,
  RafOpportunityTelemetry,
  RenderAttemptTelemetry,
  RenderEncodeTelemetry,
  RenderRejectionTelemetry,
  RenderSubmissionTelemetry,
  RetainedGpuPassTelemetry,
  RetainedRenderAttemptTelemetry,
  RetainedRenderEncodeTelemetry,
  SimulationRevisionTelemetry,
} from "./frame-telemetry-types";
import { FixedTelemetryRing } from "./fixed-telemetry-ring";
import { FrameTelemetryIndexes } from "./frame-telemetry-indexes";
import {
  copyAttempt,
  emptyAttemptSlot,
  emptyEncodeSlot,
  emptyGpuPassSlot,
  emptyRafSlot,
  emptySimulationSlot,
  requirePendingAttempt,
  type AttemptSlot,
  type EncodeSlot,
  type GpuPassSlot,
  type RafSlot,
  type SimulationSlot,
  writeAttemptSlot,
  writeEncodeSlot,
  writeGpuPassSlot,
} from "./frame-telemetry-slots";
import { boundedCapacity, requireFiniteMilliseconds } from "./telemetry-validation";

const DEFAULT_FRAME_CAPACITY = 240;
const MAX_FRAME_CAPACITY = 65_536;
const MAX_GPU_PASS_CAPACITY = MAX_FRAME_CAPACITY * 4;

export type FrameTelemetryStoreOptions = Readonly<{
  frameCapacity?: number;
  gpuPassCapacity?: number;
}>;

/** Retains a fixed-size device telemetry window; all hot-path slots are preallocated. */
export class FrameTelemetryStore {
  readonly frameCapacity: number;
  readonly gpuPassCapacity: number;
  private readonly rafRing: FixedTelemetryRing<RafSlot>;
  private readonly simulationRing: FixedTelemetryRing<SimulationSlot>;
  private readonly attemptRing: FixedTelemetryRing<AttemptSlot>;
  private readonly encodeRing: FixedTelemetryRing<EncodeSlot>;
  private readonly gpuPassRing: FixedTelemetryRing<GpuPassSlot>;
  private readonly indexes = new FrameTelemetryIndexes();

  constructor(readonly deviceScopeId: string, options: FrameTelemetryStoreOptions = {}) {
    if (deviceScopeId.trim().length === 0) throw new Error("A frame telemetry store requires a device scope id.");
    this.frameCapacity = boundedCapacity(
      options.frameCapacity,
      DEFAULT_FRAME_CAPACITY,
      MAX_FRAME_CAPACITY,
      "frameCapacity",
    );
    this.gpuPassCapacity = boundedCapacity(
      options.gpuPassCapacity,
      this.frameCapacity * 4,
      MAX_GPU_PASS_CAPACITY,
      "gpuPassCapacity",
    );
    this.rafRing = new FixedTelemetryRing(this.frameCapacity, emptyRafSlot);
    this.simulationRing = new FixedTelemetryRing(this.frameCapacity, emptySimulationSlot);
    this.attemptRing = new FixedTelemetryRing(this.frameCapacity, emptyAttemptSlot);
    this.encodeRing = new FixedTelemetryRing(this.frameCapacity, emptyEncodeSlot);
    this.gpuPassRing = new FixedTelemetryRing(this.gpuPassCapacity, emptyGpuPassSlot);
  }

  recordRafOpportunity(sample: RafOpportunityTelemetry): void {
    requireFiniteMilliseconds(sample.timestampMilliseconds, "RAF opportunity timestamp");
    if (this.indexes.raf.has(sample.opportunityId)) {
      throw new Error(`RAF opportunity ${sample.opportunityId} was recorded more than once.`);
    }
    const slot = this.rafRing.writeSlot();
    if (slot.opportunityId !== null) this.indexes.raf.delete(slot.opportunityId);
    slot.opportunityId = sample.opportunityId;
    slot.timestampMilliseconds = sample.timestampMilliseconds;
    this.indexes.raf.add(sample.opportunityId);
    this.rafRing.commitWrite();
  }

  recordSimulationRevision(sample: SimulationRevisionTelemetry): void {
    requireFiniteMilliseconds(sample.publishedAtMilliseconds, "simulation publication timestamp");
    if (this.indexes.simulation.has(sample.revisionId)) {
      throw new Error(`Simulation revision ${sample.revisionId} was recorded more than once.`);
    }
    const slot = this.simulationRing.writeSlot();
    if (slot.revisionId !== null) this.indexes.simulation.delete(slot.revisionId);
    slot.revisionId = sample.revisionId;
    slot.publishedAtMilliseconds = sample.publishedAtMilliseconds;
    this.indexes.simulation.add(sample.revisionId);
    this.simulationRing.commitWrite();
  }

  recordRenderAttempt(sample: RenderAttemptTelemetry): void {
    requireFiniteMilliseconds(sample.attemptedAtMilliseconds, "render attempt timestamp");
    if (!this.indexes.raf.has(sample.opportunityId)) {
      throw new Error(`Render attempt ${sample.attemptId} references an unknown RAF opportunity.`);
    }
    if (sample.simulationRevisionId !== null && !this.indexes.simulation.has(sample.simulationRevisionId)) {
      throw new Error(`Render attempt ${sample.attemptId} references an unknown simulation revision.`);
    }
    if (this.indexes.attempt.has(sample.attemptId)) {
      throw new Error(`Render attempt ${sample.attemptId} was recorded more than once.`);
    }
    const slotIndex = this.attemptRing.writeIndex;
    const slot = this.attemptRing.writeSlot();
    this.indexes.releaseAttempt(slot);
    writeAttemptSlot(slot, sample);
    this.indexes.attempt.set(sample.attemptId, slotIndex);
    this.attemptRing.commitWrite();
  }

  recordRenderEncodeTiming(sample: RenderEncodeTelemetry): boolean {
    requireFiniteMilliseconds(sample.encodeStartedAtMilliseconds, "render encode start timestamp");
    requireFiniteMilliseconds(sample.encodeCompletedAtMilliseconds, "render encode completion timestamp");
    if (sample.encodeCompletedAtMilliseconds < sample.encodeStartedAtMilliseconds) {
      throw new Error("Render encode completion cannot precede its start.");
    }
    if (!this.indexes.attempt.has(sample.attemptId)) return false;
    if (this.indexes.encode.has(sample.attemptId)) {
      throw new Error(`Render attempt ${sample.attemptId} already has encode timing.`);
    }
    const slot = this.encodeRing.writeSlot();
    if (slot.attemptId !== null) this.indexes.encode.delete(slot.attemptId);
    writeEncodeSlot(slot, sample);
    this.indexes.encode.set(sample.attemptId, this.encodeRing.writeIndex);
    this.encodeRing.commitWrite();
    return true;
  }

  recordRenderSubmission(sample: RenderSubmissionTelemetry): boolean {
    requireFiniteMilliseconds(sample.submittedAtMilliseconds, "render submission timestamp");
    const slotIndex = this.indexes.attempt.get(sample.attemptId);
    if (slotIndex === undefined) return false;
    if (this.indexes.submission.has(sample.submissionId)) {
      throw new Error(`Render submission ${sample.submissionId} was recorded more than once.`);
    }
    if (this.indexes.epoch.has(sample.queueEpochId)) {
      throw new Error(`Queue epoch ${sample.queueEpochId} already owns a render submission.`);
    }
    const slot = this.attemptRing.slots[slotIndex];
    requirePendingAttempt(slot, sample.attemptId);
    slot.status = "submitted";
    slot.submissionId = sample.submissionId;
    slot.queueEpochId = sample.queueEpochId;
    slot.submittedAtMilliseconds = sample.submittedAtMilliseconds;
    this.indexes.submission.set(sample.submissionId, slotIndex);
    this.indexes.epoch.set(sample.queueEpochId, slotIndex);
    return true;
  }

  recordRenderRejection(sample: RenderRejectionTelemetry): boolean {
    const slotIndex = this.indexes.attempt.get(sample.attemptId);
    if (slotIndex === undefined) return false;
    const reason = sample.reason.trim();
    if (reason.length === 0) throw new Error("A rejected render attempt requires a reason.");
    const slot = this.attemptRing.slots[slotIndex];
    requirePendingAttempt(slot, sample.attemptId);
    slot.status = "rejected";
    slot.rejectionReason = reason;
    return true;
  }

  recordQueueRetirement(sample: QueueRetirementTelemetry): boolean {
    requireFiniteMilliseconds(sample.retiredAtMilliseconds, "queue retirement timestamp");
    const slotIndex = this.indexes.epoch.get(sample.queueEpochId);
    if (slotIndex === undefined) {
      this.indexes.countUnmatchedQueueRetirement();
      return false;
    }
    const slot = this.attemptRing.slots[slotIndex];
    if (slot.status !== "submitted") return false;
    slot.retiredAtMilliseconds = sample.retiredAtMilliseconds;
    return true;
  }

  recordGpuPassSample(sample: GpuPassTelemetry): boolean {
    requireFiniteMilliseconds(sample.durationMilliseconds, "GPU pass duration");
    if (this.indexes.gpuPass.has(sample.sampleId)) {
      throw new Error(`GPU pass sample ${sample.sampleId} was recorded more than once.`);
    }
    if (!this.indexes.submission.has(sample.submissionId)) {
      this.indexes.countDroppedGpuPassSample();
      return false;
    }
    const passId = sample.passId.trim();
    if (passId.length === 0) throw new Error("A GPU pass sample requires a pass id.");
    const slot = this.gpuPassRing.writeSlot();
    if (slot.sampleId !== null) this.indexes.gpuPass.delete(slot.sampleId);
    writeGpuPassSlot(slot, sample, passId);
    this.indexes.gpuPass.set(sample.sampleId, this.gpuPassRing.writeIndex);
    this.gpuPassRing.commitWrite();
    return true;
  }

  findRenderAttempt(attemptId: RenderAttemptId): RetainedRenderAttemptTelemetry | null {
    const slotIndex = this.indexes.attempt.get(attemptId);
    return slotIndex === undefined ? null : copyAttempt(this.attemptRing.slots[slotIndex]);
  }

  visitRafOpportunities(visitor: (sample: RafOpportunityTelemetry) => void): void {
    this.rafRing.visit((slot) => slot.opportunityId !== null && visitor(slot as RafOpportunityTelemetry));
  }

  visitSimulationRevisions(visitor: (sample: SimulationRevisionTelemetry) => void): void {
    this.simulationRing.visit((slot) => slot.revisionId !== null && visitor(slot as SimulationRevisionTelemetry));
  }

  visitRenderAttempts(visitor: (sample: RetainedRenderAttemptTelemetry) => void): void {
    this.attemptRing.visit((slot) => slot.attemptId !== null && visitor(slot as RetainedRenderAttemptTelemetry));
  }

  visitRenderEncodeTimings(visitor: (sample: RetainedRenderEncodeTelemetry) => void): void {
    this.encodeRing.visit((slot) => {
      if (slot.attemptId !== null && this.indexes.attempt.has(slot.attemptId)) {
        visitor(slot as RetainedRenderEncodeTelemetry);
      }
    });
  }

  visitGpuPassSamples(visitor: (sample: RetainedGpuPassTelemetry) => void): void {
    this.gpuPassRing.visit((slot) => {
      if (slot.sampleId !== null && slot.submissionId !== null && this.indexes.submission.has(slot.submissionId)) {
        visitor(slot as RetainedGpuPassTelemetry);
      }
    });
  }

  retentionDiagnostics(): FrameTelemetryRetentionDiagnostics {
    return this.indexes.diagnostics();
  }
}
