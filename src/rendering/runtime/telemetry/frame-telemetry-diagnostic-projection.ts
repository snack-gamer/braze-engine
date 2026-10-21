import {
  FrameTelemetryAggregator,
  type FrameTelemetrySummary,
} from "./frame-telemetry-aggregator";
import { FrameTelemetryStore } from "./frame-telemetry-store";

export type AvailableDiagnosticNumber = Readonly<{
  status: "available";
  value: number;
}>;

export type UnavailableDiagnosticNumber = Readonly<{
  status: "unavailable";
  reason: "insufficient-retained-samples" | "no-terminal-render-attempts";
}>;

export type DiagnosticNumber = AvailableDiagnosticNumber | UnavailableDiagnosticNumber;

export type TimingDistribution = Readonly<{
  sampleCount: number;
  totalMilliseconds: number;
  p50Milliseconds: number;
  p95Milliseconds: number;
  p99Milliseconds: number;
}>;

export type GpuPassTimingProjection =
  | Readonly<{
      status: "available";
      passes: readonly (TimingDistribution & Readonly<{ passId: string }>)[];
    }>
  | Readonly<{
      status: "unavailable";
      reason: "no-gpu-pass-samples";
    }>;

export type RenderEncodeTimingProjection =
  | Readonly<{
      status: "available";
      distribution: TimingDistribution;
    }>
  | Readonly<{
      status: "unavailable";
      reason: "no-render-encode-samples";
    }>;

export type FrameTelemetryDiagnosticProjection = Readonly<{
  deviceScopeId: string;
  rates: Readonly<{
    /** Browser animation callback opportunity cadence. */
    rafOpportunityHz: DiagnosticNumber;
    /** Accepted governed surface/device-task callback cadence. */
    submittedHz: DiagnosticNumber;
    /** Queue work retirement cadence; this is not a display presentation rate. */
    gpuRetirementHz: DiagnosticNumber;
  }>;
  /** Submitted / (submitted + rejected); unsettled attempts are excluded. */
  submissionRatio: DiagnosticNumber;
  counts: Readonly<{
    rafOpportunities: number;
    renderAttempts: number;
    submittedRenderAttempts: number;
    retiredRenderSubmissions: number;
    pendingRenderAttempts: number;
    inFlightRenderSubmissions: number;
    rejectedRenderAttempts: number;
    /** Rejections whose reason is `superseded` under latest-wins coalescing. */
    coalescedRenderAttempts: number;
  }>;
  gpuPassTiming: GpuPassTimingProjection;
  renderEncodeTiming: RenderEncodeTimingProjection;
  retention: Readonly<{
    droppedGpuPassSamples: number;
    unmatchedQueueRetirements: number;
    evictedPendingAttempts: number;
  }>;
}>;

/** Creates a deeply immutable diagnostic view; call outside the render hot path. */
export class FrameTelemetryDiagnosticProjector {
  private readonly aggregator: FrameTelemetryAggregator;

  constructor(private readonly store: FrameTelemetryStore) {
    this.aggregator = new FrameTelemetryAggregator(store);
  }

  project(): FrameTelemetryDiagnosticProjection {
    const summary = this.aggregator.summarize();
    const terminalAttempts = summary.submittedRenderAttempts + summary.rejectedRenderAttempts;
    return Object.freeze({
      deviceScopeId: summary.deviceScopeId,
      rates: Object.freeze({
        rafOpportunityHz: rate(summary.rafOpportunityRateHz, summary.rafOpportunityRateAvailable),
        submittedHz: rate(summary.renderSubmissionRateHz, summary.renderSubmissionRateAvailable),
        gpuRetirementHz: rate(summary.gpuRetirementRateHz, summary.gpuRetirementRateAvailable),
      }),
      submissionRatio: terminalAttempts === 0
        ? unavailable("no-terminal-render-attempts")
        : available(summary.submittedRenderAttempts / terminalAttempts),
      counts: projectCounts(summary),
      gpuPassTiming: projectGpuPassTiming(this.store),
      renderEncodeTiming: projectRenderEncodeTiming(this.store),
      retention: Object.freeze({ ...summary.retention }),
    });
  }
}

function projectCounts(summary: FrameTelemetrySummary): FrameTelemetryDiagnosticProjection["counts"] {
  return Object.freeze({
    rafOpportunities: summary.rafOpportunities,
    renderAttempts: summary.renderAttempts,
    submittedRenderAttempts: summary.submittedRenderAttempts,
    retiredRenderSubmissions: summary.retiredRenderSubmissions,
    pendingRenderAttempts: summary.pendingRenderAttempts,
    inFlightRenderSubmissions: summary.inFlightRenderSubmissions,
    rejectedRenderAttempts: summary.rejectedRenderAttempts,
    coalescedRenderAttempts: summary.coalescedRenderAttempts,
  });
}

function projectGpuPassTiming(store: FrameTelemetryStore): GpuPassTimingProjection {
  const groups = new Map<string, number[]>();
  store.visitGpuPassSamples((sample) => {
    let durations = groups.get(sample.passId);
    if (durations === undefined) {
      durations = [];
      groups.set(sample.passId, durations);
    }
    durations.push(sample.durationMilliseconds);
  });
  if (groups.size === 0) return Object.freeze({ status: "unavailable", reason: "no-gpu-pass-samples" });

  const passes = Array.from(groups, ([passId, durations]) => Object.freeze({
    passId,
    ...distribution(durations),
  }));
  passes.sort((left, right) => left.passId.localeCompare(right.passId));
  return Object.freeze({ status: "available", passes: Object.freeze(passes) });
}

function projectRenderEncodeTiming(store: FrameTelemetryStore): RenderEncodeTimingProjection {
  const durations: number[] = [];
  store.visitRenderEncodeTimings((sample) => {
    durations.push(sample.encodeCompletedAtMilliseconds - sample.encodeStartedAtMilliseconds);
  });
  if (durations.length === 0) {
    return Object.freeze({ status: "unavailable", reason: "no-render-encode-samples" });
  }
  return Object.freeze({ status: "available", distribution: distribution(durations) });
}

function distribution(values: number[]): TimingDistribution {
  values.sort((left, right) => left - right);
  return Object.freeze({
    sampleCount: values.length,
    totalMilliseconds: values.reduce((total, value) => total + value, 0),
    p50Milliseconds: percentile(values, 0.5),
    p95Milliseconds: percentile(values, 0.95),
    p99Milliseconds: percentile(values, 0.99),
  });
}

function percentile(sortedValues: readonly number[], quantile: number): number {
  return sortedValues[Math.ceil(sortedValues.length * quantile) - 1];
}

function rate(value: number, isAvailable: boolean): DiagnosticNumber {
  return isAvailable ? available(value) : unavailable("insufficient-retained-samples");
}

function available(value: number): AvailableDiagnosticNumber {
  return Object.freeze({ status: "available", value });
}

function unavailable(reason: UnavailableDiagnosticNumber["reason"]): UnavailableDiagnosticNumber {
  return Object.freeze({ status: "unavailable", reason });
}
