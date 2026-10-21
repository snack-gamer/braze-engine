import type { Renderer } from "three/webgpu";
import type { ThreeWebGpuDeviceTaskLane } from "../../three-webgpu-render-session-contract";
import type { FrameTelemetryStore } from "../../../runtime/telemetry/frame-telemetry-store";
import type { DeviceRenderTimingIdentities } from "../../../runtime/telemetry/render-timing-identities";
import type {
  RafOpportunityId,
  RenderSubmissionId,
} from "../../../runtime/telemetry/render-timing-identities";
import {
  THREE_AGGREGATE_GPU_TIMING_PASS_ID,
  type ThreeAggregateGpuTimingAnchor,
} from "./three-aggregate-gpu-timing-contract";

const DEFAULT_SAMPLE_INTERVAL_MILLISECONDS = 500;
const MINIMUM_SAMPLE_INTERVAL_MILLISECONDS = 100;

export type { ThreeAggregateGpuTimingAnchor } from "./three-aggregate-gpu-timing-contract";

export type ThreeAggregateGpuTimingPhase =
  | "unsupported"
  | "idle"
  | "scheduled"
  | "resolving"
  | "available"
  | "failed"
  | "disposed";

export type ThreeAggregateGpuTimingDiagnostics = Readonly<{
  phase: ThreeAggregateGpuTimingPhase;
  observedSubmissions: number;
  completedSamples: number;
  droppedSamples: number;
  unavailableResults: number;
  failedResolutions: number;
  lastDurationMilliseconds: number | null;
  lastSubmissionId: RenderSubmissionId | null;
  lastOpportunityId: RafOpportunityId | null;
}>;

export type ThreeAggregateGpuTimingFlushDisposition =
  | "submitted"
  | "queued"
  | "rejected"
  | "idle"
  | "unsupported"
  | "disposed";

export type ThreeAggregateGpuTimingController = Readonly<{
  observeSubmission: (anchor: ThreeAggregateGpuTimingAnchor) => boolean;
  flush: (opportunity: RafOpportunityId) => ThreeAggregateGpuTimingFlushDisposition;
  diagnostics: () => ThreeAggregateGpuTimingDiagnostics;
  /** Returns the active public timestamp mapping, if one must settle before teardown. */
  whenSettled: () => Promise<void> | null;
  dispose: () => void;
}>;

export type ThreeAggregateGpuTimingControllerOptions = Readonly<{
  timestampQuerySupported: boolean;
  lane: ThreeWebGpuDeviceTaskLane | null;
  identities: Pick<DeviceRenderTimingIdentities, "deviceScopeId" | "nextGpuPassSample">;
  telemetry: Pick<FrameTelemetryStore, "deviceScopeId" | "recordGpuPassSample">;
  sampleIntervalMilliseconds?: number;
  passId?: string;
  onError?: (error: unknown) => void;
}>;

export type ThreeAggregateGpuTimingControllerDependencies = Readonly<{
  resolveRenderTimestamps: (renderer: Renderer) => Promise<number | undefined>;
}>;

const DEFAULT_DEPENDENCIES: ThreeAggregateGpuTimingControllerDependencies = {
  resolveRenderTimestamps: (renderer) => renderer.resolveTimestampsAsync("render"),
};

/** Resolves Three's aggregate render timestamps only through a governed device task lane. */
export function createThreeAggregateGpuTimingController(
  options: ThreeAggregateGpuTimingControllerOptions,
  dependencies: ThreeAggregateGpuTimingControllerDependencies = DEFAULT_DEPENDENCIES,
): ThreeAggregateGpuTimingController {
  validateOptions(options);
  const interval = options.sampleIntervalMilliseconds ?? DEFAULT_SAMPLE_INTERVAL_MILLISECONDS;
  const passId = (options.passId ?? THREE_AGGREGATE_GPU_TIMING_PASS_ID).trim();
  let phase: ThreeAggregateGpuTimingPhase = options.timestampQuerySupported ? "idle" : "unsupported";
  let latestAnchor: ThreeAggregateGpuTimingAnchor | null = null;
  let lastRequestAt: number | null = null;
  let requestToken = 0;
  let resolving = false;
  let disposed = false;
  let observedSubmissions = 0;
  let completedSamples = 0;
  let droppedSamples = 0;
  let unavailableResults = 0;
  let failedResolutions = 0;
  let lastDurationMilliseconds: number | null = null;
  let lastSubmissionId: RenderSubmissionId | null = null;
  let lastOpportunityId: RafOpportunityId | null = null;
  let activeResolution: Promise<void> | null = null;

  const reportFailure = (error: unknown) => {
    failedResolutions += 1;
    phase = "failed";
    try { options.onError?.(error); } catch { /* Observers cannot break timing ownership. */ }
  };

  const complete = (anchor: ThreeAggregateGpuTimingAnchor, duration: number | undefined) => {
    resolving = false;
    if (disposed) return;
    if (duration === undefined || !Number.isFinite(duration) || duration < 0) {
      unavailableResults += 1;
      phase = "idle";
      return;
    }
    try {
      const retained = options.telemetry.recordGpuPassSample({
        sampleId: options.identities.nextGpuPassSample(),
        submissionId: anchor.submissionId,
        passId,
        durationMilliseconds: duration,
      });
      if (!retained) droppedSamples += 1;
      else completedSamples += 1;
      lastDurationMilliseconds = duration;
      lastSubmissionId = anchor.submissionId;
      lastOpportunityId = anchor.opportunityId;
      phase = retained ? "available" : "idle";
    } catch (error) {
      reportFailure(error);
    }
  };

  const resolveInsideLane = (token: number, renderer: Renderer): void => {
    if (disposed || token !== requestToken || resolving) return;
    const anchor = latestAnchor;
    if (!anchor) return;
    lastRequestAt = anchor.submittedAtMilliseconds;
    resolving = true;
    phase = "resolving";
    let pending: Promise<number | undefined>;
    try {
      pending = dependencies.resolveRenderTimestamps(renderer);
    } catch (error) {
      resolving = false;
      reportFailure(error);
      return;
    }
    const completion = pending.then(
      (duration) => complete(anchor, duration),
      (error) => {
        resolving = false;
        if (!disposed) reportFailure(error);
      },
    );
    const tracked = completion.finally(() => {
      if (activeResolution === tracked) activeResolution = null;
    });
    activeResolution = tracked;
    void activeResolution;
  };

  return Object.freeze({
    observeSubmission: (anchor) => {
      if (disposed) return false;
      validateAnchor(anchor, latestAnchor);
      latestAnchor = anchor;
      observedSubmissions += 1;
      return true;
    },
    flush: (opportunity) => {
      if (disposed) return "disposed";
      if (!options.timestampQuerySupported) return "unsupported";
      if (resolving || !latestAnchor) return "idle";
      if (lastRequestAt !== null
        && latestAnchor.submittedAtMilliseconds - lastRequestAt < interval) return "idle";
      validateIdentity(opportunity, "GPU timing RAF opportunity");
      lastRequestAt = latestAnchor.submittedAtMilliseconds;
      const token = ++requestToken;
      phase = "scheduled";
      try {
        const disposition = options.lane!.request(
          opportunity,
          (renderer) => resolveInsideLane(token, renderer),
        );
        if (disposition === "rejected" && token === requestToken && !resolving) phase = "idle";
        return disposition;
      } catch (error) {
        if (token === requestToken && !resolving) reportFailure(error);
        return "rejected";
      }
    },
    diagnostics: () => Object.freeze({
      phase,
      observedSubmissions,
      completedSamples,
      droppedSamples,
      unavailableResults,
      failedResolutions,
      lastDurationMilliseconds,
      lastSubmissionId,
      lastOpportunityId,
    }),
    whenSettled: () => activeResolution,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      requestToken += 1;
      phase = "disposed";
      latestAnchor = null;
      options.lane?.dispose();
    },
  });
}

function validateOptions(options: ThreeAggregateGpuTimingControllerOptions): void {
  if (options.identities.deviceScopeId !== options.telemetry.deviceScopeId) {
    throw new Error("GPU timing identities and telemetry must belong to the same device scope.");
  }
  if (options.timestampQuerySupported && options.lane === null) {
    throw new Error("Supported GPU timing requires a device task lane.");
  }
  const interval = options.sampleIntervalMilliseconds ?? DEFAULT_SAMPLE_INTERVAL_MILLISECONDS;
  if (!Number.isFinite(interval) || interval < MINIMUM_SAMPLE_INTERVAL_MILLISECONDS) {
    throw new RangeError(`GPU timing sample interval must be at least ${MINIMUM_SAMPLE_INTERVAL_MILLISECONDS} ms.`);
  }
  if ((options.passId ?? THREE_AGGREGATE_GPU_TIMING_PASS_ID).trim().length === 0) {
    throw new Error("GPU aggregate timing requires a pass id.");
  }
}

function validateAnchor(
  anchor: ThreeAggregateGpuTimingAnchor,
  previous: ThreeAggregateGpuTimingAnchor | null,
): void {
  validateIdentity(anchor.submissionId, "GPU timing render submission");
  validateIdentity(anchor.opportunityId, "GPU timing RAF opportunity");
  if (!Number.isFinite(anchor.submittedAtMilliseconds) || anchor.submittedAtMilliseconds < 0) {
    throw new Error("GPU timing submission timestamp must be finite and non-negative.");
  }
  if (previous && anchor.submittedAtMilliseconds < previous.submittedAtMilliseconds) {
    throw new Error("GPU timing submission anchors must be observed in timestamp order.");
  }
}

function validateIdentity(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer.`);
}
