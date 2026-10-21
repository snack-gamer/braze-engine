import { describe, expect, it } from "vitest";
import {
  FrameTelemetryDiagnosticProjector,
} from "./frame-telemetry-diagnostic-projection";
import { FrameTelemetryStore } from "./frame-telemetry-store";
import { DeviceRenderTimingIdentities } from "./render-timing-identities";

describe("FrameTelemetryDiagnosticProjector", () => {
  it("keeps opportunity, submission, and retirement rates distinct", () => {
    const ids = new DeviceRenderTimingIdentities("diagnostic-device");
    const store = new FrameTelemetryStore(ids.deviceScopeId, {
      frameCapacity: 8,
      gpuPassCapacity: 8,
    });
    const opportunities = [0, 10, 20, 30, 40].map((timestampMilliseconds) => {
      const opportunityId = ids.nextRafOpportunity();
      store.recordRafOpportunity({ opportunityId, timestampMilliseconds });
      return opportunityId;
    });

    const first = ids.nextRenderAttempt();
    const firstSubmission = ids.nextRenderSubmission();
    const firstEpoch = ids.nextQueueEpoch();
    store.recordRenderAttempt({
      attemptId: first,
      opportunityId: opportunities[0],
      simulationRevisionId: null,
      attemptedAtMilliseconds: 0,
    });
    store.recordRenderEncodeTiming({
      attemptId: first,
      encodeStartedAtMilliseconds: 0,
      encodeCompletedAtMilliseconds: 1,
    });
    store.recordRenderSubmission({
      attemptId: first,
      submissionId: firstSubmission,
      queueEpochId: firstEpoch,
      submittedAtMilliseconds: 1,
    });
    store.recordQueueRetirement({ queueEpochId: firstEpoch, retiredAtMilliseconds: 10 });

    const second = ids.nextRenderAttempt();
    const secondSubmission = ids.nextRenderSubmission();
    const secondEpoch = ids.nextQueueEpoch();
    store.recordRenderAttempt({
      attemptId: second,
      opportunityId: opportunities[1],
      simulationRevisionId: null,
      attemptedAtMilliseconds: 10,
    });
    store.recordRenderEncodeTiming({
      attemptId: second,
      encodeStartedAtMilliseconds: 10,
      encodeCompletedAtMilliseconds: 12,
    });
    store.recordRenderSubmission({
      attemptId: second,
      submissionId: secondSubmission,
      queueEpochId: secondEpoch,
      submittedAtMilliseconds: 21,
    });
    store.recordQueueRetirement({ queueEpochId: secondEpoch, retiredAtMilliseconds: 50 });

    const third = ids.nextRenderAttempt();
    const thirdSubmission = ids.nextRenderSubmission();
    store.recordRenderAttempt({
      attemptId: third,
      opportunityId: opportunities[2],
      simulationRevisionId: null,
      attemptedAtMilliseconds: 20,
    });
    store.recordRenderSubmission({
      attemptId: third,
      submissionId: thirdSubmission,
      queueEpochId: ids.nextQueueEpoch(),
      submittedAtMilliseconds: 41,
    });

    const rejected = ids.nextRenderAttempt();
    store.recordRenderAttempt({
      attemptId: rejected,
      opportunityId: opportunities[3],
      simulationRevisionId: null,
      attemptedAtMilliseconds: 30,
    });
    store.recordRenderRejection({ attemptId: rejected, reason: "superseded" });
    store.recordRenderAttempt({
      attemptId: ids.nextRenderAttempt(),
      opportunityId: opportunities[4],
      simulationRevisionId: null,
      attemptedAtMilliseconds: 40,
    });

    recordGpuPass(store, ids, firstSubmission, "shadow", 1);
    recordGpuPass(store, ids, secondSubmission, "shadow", 3);
    recordGpuPass(store, ids, thirdSubmission, "shadow", 5);
    recordGpuPass(store, ids, firstSubmission, "composite", 2);
    recordGpuPass(store, ids, secondSubmission, "composite", 4);

    const projection = new FrameTelemetryDiagnosticProjector(store).project();
    expect(projection.rates).toEqual({
      rafOpportunityHz: { status: "available", value: 100 },
      submittedHz: { status: "available", value: 50 },
      gpuRetirementHz: { status: "available", value: 25 },
    });
    expect(projection.submissionRatio).toEqual({ status: "available", value: 0.75 });
    expect(projection.counts).toMatchObject({
      renderAttempts: 5,
      submittedRenderAttempts: 3,
      retiredRenderSubmissions: 2,
      pendingRenderAttempts: 1,
      inFlightRenderSubmissions: 1,
      rejectedRenderAttempts: 1,
      coalescedRenderAttempts: 1,
    });
    expect(projection.gpuPassTiming).toEqual({
      status: "available",
      passes: [
        {
          passId: "composite",
          sampleCount: 2,
          totalMilliseconds: 6,
          p50Milliseconds: 2,
          p95Milliseconds: 4,
          p99Milliseconds: 4,
        },
        {
          passId: "shadow",
          sampleCount: 3,
          totalMilliseconds: 9,
          p50Milliseconds: 3,
          p95Milliseconds: 5,
          p99Milliseconds: 5,
        },
      ],
    });
    expect(projection.renderEncodeTiming).toEqual({
      status: "available",
      distribution: {
        sampleCount: 2,
        totalMilliseconds: 3,
        p50Milliseconds: 1,
        p95Milliseconds: 2,
        p99Milliseconds: 2,
      },
    });
    expectDeepFrozen(projection);
    expect(JSON.stringify(projection).toLowerCase()).not.toContain("fps");
  });

  it("reports explicit unavailable states instead of zero-valued timing claims", () => {
    const store = new FrameTelemetryStore("empty-diagnostic-device", { frameCapacity: 2 });
    const projection = new FrameTelemetryDiagnosticProjector(store).project();

    expect(projection.rates).toEqual({
      rafOpportunityHz: { status: "unavailable", reason: "insufficient-retained-samples" },
      submittedHz: { status: "unavailable", reason: "insufficient-retained-samples" },
      gpuRetirementHz: { status: "unavailable", reason: "insufficient-retained-samples" },
    });
    expect(projection.submissionRatio).toEqual({
      status: "unavailable",
      reason: "no-terminal-render-attempts",
    });
    expect(projection.gpuPassTiming).toEqual({
      status: "unavailable",
      reason: "no-gpu-pass-samples",
    });
    expect(projection.renderEncodeTiming).toEqual({
      status: "unavailable",
      reason: "no-render-encode-samples",
    });
    expectDeepFrozen(projection);
  });
});

function recordGpuPass(
  store: FrameTelemetryStore,
  ids: DeviceRenderTimingIdentities,
  submissionId: ReturnType<DeviceRenderTimingIdentities["nextRenderSubmission"]>,
  passId: string,
  durationMilliseconds: number,
): void {
  store.recordGpuPassSample({
    sampleId: ids.nextGpuPassSample(),
    submissionId,
    passId,
    durationMilliseconds,
  });
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}
