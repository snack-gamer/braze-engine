import type { FrameTelemetryRetentionDiagnostics } from "./frame-telemetry-types";
import { FrameTelemetryStore } from "./frame-telemetry-store";

export type FrameTelemetrySummary = Readonly<{
  deviceScopeId: string;
  rafOpportunities: number;
  rafOpportunityRateHz: number;
  rafOpportunityRateAvailable: boolean;
  simulationRevisions: number;
  renderAttempts: number;
  pendingRenderAttempts: number;
  submittedRenderAttempts: number;
  renderSubmissionRateHz: number;
  renderSubmissionRateAvailable: boolean;
  inFlightRenderSubmissions: number;
  rejectedRenderAttempts: number;
  coalescedRenderAttempts: number;
  retiredRenderSubmissions: number;
  gpuRetirementRateHz: number;
  gpuRetirementRateAvailable: boolean;
  gpuPassSamples: number;
  gpuPassMilliseconds: number;
  retention: FrameTelemetryRetentionDiagnostics;
}>;

/** Builds a cadence-limited immutable summary from the store's retained window. */
export class FrameTelemetryAggregator {
  constructor(private readonly store: FrameTelemetryStore) {}

  summarize(): FrameTelemetrySummary {
    let rafOpportunities = 0;
    let firstRafAt: number | null = null;
    let lastRafAt: number | null = null;
    this.store.visitRafOpportunities((sample) => {
      rafOpportunities += 1;
      firstRafAt ??= sample.timestampMilliseconds;
      lastRafAt = sample.timestampMilliseconds;
    });

    let simulationRevisions = 0;
    this.store.visitSimulationRevisions(() => {
      simulationRevisions += 1;
    });

    let renderAttempts = 0;
    let pendingRenderAttempts = 0;
    let submittedRenderAttempts = 0;
    let inFlightRenderSubmissions = 0;
    let rejectedRenderAttempts = 0;
    let coalescedRenderAttempts = 0;
    let retiredRenderSubmissions = 0;
    let firstSubmissionAt: number | null = null;
    let lastSubmissionAt: number | null = null;
    let firstRetirementAt: number | null = null;
    let lastRetirementAt: number | null = null;
    this.store.visitRenderAttempts((sample) => {
      renderAttempts += 1;
      if (sample.status === "pending") {
        pendingRenderAttempts += 1;
        return;
      }
      if (sample.status === "rejected") {
        rejectedRenderAttempts += 1;
        if (sample.rejectionReason === "superseded") coalescedRenderAttempts += 1;
        return;
      }
      submittedRenderAttempts += 1;
      const submittedAt = sample.submittedAtMilliseconds!;
      firstSubmissionAt ??= submittedAt;
      lastSubmissionAt = submittedAt;
      if (sample.retiredAtMilliseconds === null) {
        inFlightRenderSubmissions += 1;
        return;
      }
      retiredRenderSubmissions += 1;
      firstRetirementAt ??= sample.retiredAtMilliseconds;
      lastRetirementAt = sample.retiredAtMilliseconds;
    });

    let gpuPassSamples = 0;
    let gpuPassMilliseconds = 0;
    this.store.visitGpuPassSamples((sample) => {
      gpuPassSamples += 1;
      gpuPassMilliseconds += sample.durationMilliseconds;
    });

    return {
      deviceScopeId: this.store.deviceScopeId,
      rafOpportunities,
      rafOpportunityRateHz: sampleRate(rafOpportunities, firstRafAt, lastRafAt),
      rafOpportunityRateAvailable: sampleRateAvailable(rafOpportunities, firstRafAt, lastRafAt),
      simulationRevisions,
      renderAttempts,
      pendingRenderAttempts,
      submittedRenderAttempts,
      renderSubmissionRateHz: sampleRate(submittedRenderAttempts, firstSubmissionAt, lastSubmissionAt),
      renderSubmissionRateAvailable: sampleRateAvailable(
        submittedRenderAttempts,
        firstSubmissionAt,
        lastSubmissionAt,
      ),
      inFlightRenderSubmissions,
      rejectedRenderAttempts,
      coalescedRenderAttempts,
      retiredRenderSubmissions,
      gpuRetirementRateHz: sampleRate(retiredRenderSubmissions, firstRetirementAt, lastRetirementAt),
      gpuRetirementRateAvailable: sampleRateAvailable(
        retiredRenderSubmissions,
        firstRetirementAt,
        lastRetirementAt,
      ),
      gpuPassSamples,
      gpuPassMilliseconds,
      retention: this.store.retentionDiagnostics(),
    };
  }
}

function sampleRate(count: number, first: number | null, last: number | null): number {
  if (!sampleRateAvailable(count, first, last)) return 0;
  return ((count - 1) * 1000) / (last! - first!);
}

function sampleRateAvailable(count: number, first: number | null, last: number | null): boolean {
  return count >= 2 && first !== null && last !== null && last > first;
}
