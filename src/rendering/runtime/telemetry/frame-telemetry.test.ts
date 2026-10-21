import { describe, expect, it } from "vitest";
import { FrameTelemetryAggregator } from "./frame-telemetry-aggregator";
import { FrameTelemetryStore } from "./frame-telemetry-store";
import { DeviceRenderTimingIdentities } from "./render-timing-identities";

describe("device frame telemetry", () => {
  it("correlates every render timing identity inside its device scope", () => {
    const ids = new DeviceRenderTimingIdentities("device-a");
    const store = new FrameTelemetryStore(ids.deviceScopeId, { frameCapacity: 4, gpuPassCapacity: 4 });
    const opportunityId = ids.nextRafOpportunity();
    const revisionId = ids.nextSimulationRevision();
    const attemptId = ids.nextRenderAttempt();
    const submissionId = ids.nextRenderSubmission();
    const queueEpochId = ids.nextQueueEpoch();

    store.recordRafOpportunity({ opportunityId, timestampMilliseconds: 10 });
    store.recordSimulationRevision({ revisionId, publishedAtMilliseconds: 11 });
    store.recordRenderAttempt({
      attemptId,
      opportunityId,
      simulationRevisionId: revisionId,
      attemptedAtMilliseconds: 12,
    });
    expect(store.recordRenderSubmission({
      attemptId,
      submissionId,
      queueEpochId,
      submittedAtMilliseconds: 13,
    })).toBe(true);
    expect(store.recordQueueRetirement({ queueEpochId, retiredAtMilliseconds: 17 })).toBe(true);
    expect(store.recordGpuPassSample({
      sampleId: ids.nextGpuPassSample(),
      submissionId,
      passId: "main-composite",
      durationMilliseconds: 2.5,
    })).toBe(true);

    expect(store.findRenderAttempt(attemptId)).toEqual({
      attemptId,
      opportunityId,
      simulationRevisionId: revisionId,
      attemptedAtMilliseconds: 12,
      status: "submitted",
      submissionId,
      queueEpochId,
      submittedAtMilliseconds: 13,
      retiredAtMilliseconds: 17,
      rejectionReason: null,
    });
    expect(new FrameTelemetryAggregator(store).summarize()).toMatchObject({
      deviceScopeId: "device-a",
      rafOpportunities: 1,
      simulationRevisions: 1,
      renderAttempts: 1,
      submittedRenderAttempts: 1,
      rejectedRenderAttempts: 0,
      retiredRenderSubmissions: 1,
      gpuPassSamples: 1,
      gpuPassMilliseconds: 2.5,
    });

    const otherDevice = new DeviceRenderTimingIdentities("device-b");
    expect(otherDevice.nextRenderAttempt()).toBe(1);
    expect(otherDevice.deviceScopeId).not.toBe(ids.deviceScopeId);
  });

  it("accounts for every terminal attempt as either submitted or rejected", () => {
    const ids = new DeviceRenderTimingIdentities("accounting-device");
    const store = new FrameTelemetryStore(ids.deviceScopeId, { frameCapacity: 4 });
    const opportunityId = ids.nextRafOpportunity();
    store.recordRafOpportunity({ opportunityId, timestampMilliseconds: 0 });

    const attempts = [ids.nextRenderAttempt(), ids.nextRenderAttempt(), ids.nextRenderAttempt()];
    for (const [index, attemptId] of attempts.entries()) {
      store.recordRenderAttempt({
        attemptId,
        opportunityId,
        simulationRevisionId: null,
        attemptedAtMilliseconds: index,
      });
    }
    for (const attemptId of attempts.slice(0, 2)) {
      store.recordRenderSubmission({
        attemptId,
        submissionId: ids.nextRenderSubmission(),
        queueEpochId: ids.nextQueueEpoch(),
        submittedAtMilliseconds: 10,
      });
    }
    store.recordRenderRejection({ attemptId: attempts[2], reason: "queue-saturated" });

    const summary = new FrameTelemetryAggregator(store).summarize();
    expect(summary.pendingRenderAttempts).toBe(0);
    expect(summary.renderAttempts).toBe(
      summary.submittedRenderAttempts + summary.rejectedRenderAttempts,
    );
    expect(summary).toMatchObject({
      renderAttempts: 3,
      submittedRenderAttempts: 2,
      rejectedRenderAttempts: 1,
    });
  });

  it("does not count a skipped render attempt as a submitted frame", () => {
    const ids = new DeviceRenderTimingIdentities("skip-device");
    const store = new FrameTelemetryStore(ids.deviceScopeId);
    const opportunityId = ids.nextRafOpportunity();
    const attemptId = ids.nextRenderAttempt();
    store.recordRafOpportunity({ opportunityId, timestampMilliseconds: 100 });
    store.recordRenderAttempt({
      attemptId,
      opportunityId,
      simulationRevisionId: null,
      attemptedAtMilliseconds: 101,
    });
    store.recordRenderRejection({ attemptId, reason: "superseded" });

    expect(new FrameTelemetryAggregator(store).summarize()).toMatchObject({
      rafOpportunities: 1,
      renderAttempts: 1,
      submittedRenderAttempts: 0,
      renderSubmissionRateHz: 0,
      rejectedRenderAttempts: 1,
      retiredRenderSubmissions: 0,
    });
  });

  it("bounds retained records and accepts only late samples whose submission remains retained", () => {
    const ids = new DeviceRenderTimingIdentities("bounded-device");
    const store = new FrameTelemetryStore(ids.deviceScopeId, { frameCapacity: 2, gpuPassCapacity: 2 });
    const submissions = [];

    for (let index = 0; index < 3; index += 1) {
      const opportunityId = ids.nextRafOpportunity();
      const revisionId = ids.nextSimulationRevision();
      const attemptId = ids.nextRenderAttempt();
      const submissionId = ids.nextRenderSubmission();
      store.recordRafOpportunity({ opportunityId, timestampMilliseconds: index * 10 });
      store.recordSimulationRevision({ revisionId, publishedAtMilliseconds: index * 10 + 1 });
      store.recordRenderAttempt({
        attemptId,
        opportunityId,
        simulationRevisionId: revisionId,
        attemptedAtMilliseconds: index * 10 + 2,
      });
      store.recordRenderSubmission({
        attemptId,
        submissionId,
        queueEpochId: ids.nextQueueEpoch(),
        submittedAtMilliseconds: index * 10 + 3,
      });
      submissions.push({ attemptId, submissionId });
    }

    expect(store.findRenderAttempt(submissions[0].attemptId)).toBeNull();
    expect(store.recordGpuPassSample({
      sampleId: ids.nextGpuPassSample(),
      submissionId: submissions[1].submissionId,
      passId: "shadow",
      durationMilliseconds: 1.5,
    })).toBe(true);
    expect(store.recordGpuPassSample({
      sampleId: ids.nextGpuPassSample(),
      submissionId: submissions[0].submissionId,
      passId: "evicted-pass",
      durationMilliseconds: 9,
    })).toBe(false);

    expect(new FrameTelemetryAggregator(store).summarize()).toMatchObject({
      rafOpportunities: 2,
      simulationRevisions: 2,
      renderAttempts: 2,
      submittedRenderAttempts: 2,
      gpuPassSamples: 1,
      gpuPassMilliseconds: 1.5,
      retention: {
        droppedGpuPassSamples: 1,
        unmatchedQueueRetirements: 0,
        evictedPendingAttempts: 0,
      },
    });
  });

  it("retains encode spans in the bounded attempt slots without changing attempt snapshots", () => {
    const ids = new DeviceRenderTimingIdentities("encode-device");
    const store = new FrameTelemetryStore(ids.deviceScopeId, { frameCapacity: 1 });
    const firstOpportunity = ids.nextRafOpportunity();
    const firstAttempt = ids.nextRenderAttempt();
    store.recordRafOpportunity({ opportunityId: firstOpportunity, timestampMilliseconds: 0 });
    store.recordRenderAttempt({
      attemptId: firstAttempt,
      opportunityId: firstOpportunity,
      simulationRevisionId: null,
      attemptedAtMilliseconds: 1,
    });
    expect(store.recordRenderEncodeTiming({
      attemptId: firstAttempt,
      encodeStartedAtMilliseconds: 1,
      encodeCompletedAtMilliseconds: 3,
    })).toBe(true);

    const secondOpportunity = ids.nextRafOpportunity();
    const secondAttempt = ids.nextRenderAttempt();
    store.recordRafOpportunity({ opportunityId: secondOpportunity, timestampMilliseconds: 4 });
    store.recordRenderAttempt({
      attemptId: secondAttempt,
      opportunityId: secondOpportunity,
      simulationRevisionId: null,
      attemptedAtMilliseconds: 5,
    });
    expect(store.recordRenderEncodeTiming({
      attemptId: firstAttempt,
      encodeStartedAtMilliseconds: 5,
      encodeCompletedAtMilliseconds: 6,
    })).toBe(false);
    expect(() => store.recordRenderEncodeTiming({
      attemptId: secondAttempt,
      encodeStartedAtMilliseconds: 8,
      encodeCompletedAtMilliseconds: 7,
    })).toThrow(/cannot precede/);
    expect(store.recordRenderEncodeTiming({
      attemptId: secondAttempt,
      encodeStartedAtMilliseconds: 6,
      encodeCompletedAtMilliseconds: 7,
    })).toBe(true);

    const retained: Array<{
      attemptId: typeof secondAttempt;
      encodeStartedAtMilliseconds: number;
      encodeCompletedAtMilliseconds: number;
    }> = [];
    store.visitRenderEncodeTimings((sample) => retained.push({ ...sample }));
    expect(retained).toEqual([{
      attemptId: secondAttempt,
      encodeStartedAtMilliseconds: 6,
      encodeCompletedAtMilliseconds: 7,
    }]);
    expect(store.findRenderAttempt(secondAttempt)).not.toHaveProperty("encodeStartedAtMilliseconds");
  });
});
