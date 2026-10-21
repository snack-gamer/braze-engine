import type { Renderer } from "three/webgpu";
import { describe, expect, it, vi } from "vitest";
import type { ThreeWebGpuDeviceTaskLane } from "../../three-webgpu-render-session-contract";
import { FrameTelemetryStore } from "../../../runtime/telemetry/frame-telemetry-store";
import {
  DeviceRenderTimingIdentities,
  type RenderSubmissionId,
} from "../../../runtime/telemetry/render-timing-identities";
import {
  createThreeAggregateGpuTimingController,
  type ThreeAggregateGpuTimingAnchor,
} from "./three-aggregate-gpu-timing-controller";

describe("Three aggregate GPU timing controller", () => {
  it("stays inert when timestamp queries are unsupported", () => {
    const fixture = timingFixture({ supported: false });
    const anchor = fixture.recordSubmission(0);

    fixture.controller.observeSubmission(anchor);

    expect(fixture.controller.flush(anchor.opportunityId)).toBe("unsupported");
    expect(fixture.resolveRenderTimestamps).not.toHaveBeenCalled();
    expect(fixture.controller.diagnostics()).toMatchObject({
      phase: "unsupported",
      observedSubmissions: 1,
      completedSamples: 0,
    });
  });

  it("kicks off public timestamp resolution inside the admitted synchronous lane", async () => {
    let insideLane = false;
    const pending = deferred<number | undefined>();
    const renderer = {} as Renderer;
    const lane = laneStub((_, task) => {
      insideLane = true;
      task(renderer);
      insideLane = false;
      return "submitted";
    });
    const fixture = timingFixture({
      lane,
      resolve: vi.fn(() => {
        expect(insideLane).toBe(true);
        return pending.promise;
      }),
    });
    const anchor = fixture.recordSubmission(10);

    fixture.controller.observeSubmission(anchor);
    expect(fixture.controller.flush(anchor.opportunityId)).toBe("submitted");
    expect(fixture.controller.diagnostics().phase).toBe("resolving");
    pending.resolve(3.25);
    await pending.promise;
    await Promise.resolve();

    const samples: Array<{ submissionId: RenderSubmissionId; passId: string; duration: number }> = [];
    fixture.telemetry.visitGpuPassSamples((sample) => samples.push({
      submissionId: sample.submissionId,
      passId: sample.passId,
      duration: sample.durationMilliseconds,
    }));
    expect(samples).toEqual([{
      submissionId: anchor.submissionId,
      passId: "three-render-aggregate-window",
      duration: 3.25,
    }]);
    expect(fixture.controller.diagnostics()).toMatchObject({
      phase: "available",
      completedSamples: 1,
      lastSubmissionId: anchor.submissionId,
      lastOpportunityId: anchor.opportunityId,
    });
  });

  it("bounds readbacks by accepted submission time and permits only one async resolve", async () => {
    const firstResolution = deferred<number | undefined>();
    const secondResolution = deferred<number | undefined>();
    const resolutions = [firstResolution, secondResolution];
    const fixture = timingFixture({ resolve: vi.fn(() => resolutions.shift()!.promise) });
    const first = fixture.recordSubmission(0);
    fixture.controller.observeSubmission(first);
    fixture.controller.flush(first.opportunityId);

    const tooSoon = fixture.recordSubmission(499);
    fixture.controller.observeSubmission(tooSoon);
    expect(fixture.controller.flush(tooSoon.opportunityId)).toBe("idle");
    const eligible = fixture.recordSubmission(500);
    fixture.controller.observeSubmission(eligible);
    expect(fixture.controller.flush(eligible.opportunityId)).toBe("idle");
    expect(fixture.resolveRenderTimestamps).toHaveBeenCalledTimes(1);

    firstResolution.resolve(1);
    await firstResolution.promise;
    await Promise.resolve();
    expect(fixture.controller.flush(eligible.opportunityId)).toBe("submitted");
    expect(fixture.resolveRenderTimestamps).toHaveBeenCalledTimes(2);
  });

  it("coalesces a backed-up timing lane onto the latest actual submission anchor", async () => {
    const callbacks: Array<(renderer: Renderer) => void> = [];
    const lane = laneStub((_, task) => {
      callbacks.push(task);
      return "queued";
    });
    const fixture = timingFixture({ lane });
    const first = fixture.recordSubmission(0);
    fixture.controller.observeSubmission(first);
    fixture.controller.flush(first.opportunityId);
    const latest = fixture.recordSubmission(600);
    fixture.controller.observeSubmission(latest);
    fixture.controller.flush(latest.opportunityId);

    expect(callbacks).toHaveLength(2);
    callbacks[0]({} as Renderer);
    expect(fixture.resolveRenderTimestamps).not.toHaveBeenCalled();
    callbacks[1]({} as Renderer);
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.resolveRenderTimestamps).toHaveBeenCalledOnce();
    expect(fixture.controller.diagnostics()).toMatchObject({
      completedSamples: 1,
      lastSubmissionId: latest.submissionId,
      lastOpportunityId: latest.opportunityId,
    });
  });

  it("contains rejected resolutions and unavailable results without publishing CPU timing", async () => {
    const failure = new Error("timestamp map rejected");
    const onError = vi.fn();
    const results = [Promise.reject(failure), Promise.resolve(undefined)];
    const fixture = timingFixture({
      onError,
      resolve: vi.fn(() => results.shift()!),
    });
    const first = fixture.recordSubmission(0);
    fixture.controller.observeSubmission(first);
    fixture.controller.flush(first.opportunityId);
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(failure);

    const second = fixture.recordSubmission(500);
    fixture.controller.observeSubmission(second);
    fixture.controller.flush(second.opportunityId);
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.controller.diagnostics()).toMatchObject({
      phase: "idle",
      completedSamples: 0,
      failedResolutions: 1,
      unavailableResults: 1,
      lastDurationMilliseconds: null,
    });
  });

  it("disposes its lane and ignores stale async completion", async () => {
    const pending = deferred<number | undefined>();
    const fixture = timingFixture({ resolve: vi.fn(() => pending.promise) });
    const anchor = fixture.recordSubmission(0);
    fixture.controller.observeSubmission(anchor);
    fixture.controller.flush(anchor.opportunityId);

    fixture.controller.dispose();
    fixture.controller.dispose();
    expect(fixture.controller.whenSettled()).not.toBeNull();
    pending.resolve(8);
    await pending.promise;
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.lane.dispose).toHaveBeenCalledOnce();
    expect(fixture.controller.whenSettled()).toBeNull();
    expect(fixture.controller.observeSubmission(anchor)).toBe(false);
    expect(fixture.controller.flush(anchor.opportunityId)).toBe("disposed");
    expect(fixture.controller.diagnostics()).toMatchObject({
      phase: "disposed",
      completedSamples: 0,
      lastDurationMilliseconds: null,
    });
  });

  it("rejects intervals that would turn timestamp readback into per-frame work", () => {
    expect(() => timingFixture({ sampleIntervalMilliseconds: 16 })).toThrow(
      "sample interval must be at least 100 ms",
    );
  });
});

type FixtureOptions = Readonly<{
  supported?: boolean;
  lane?: ThreeWebGpuDeviceTaskLane;
  resolve?: ReturnType<typeof vi.fn<() => Promise<number | undefined>>>;
  onError?: (error: unknown) => void;
  sampleIntervalMilliseconds?: number;
}>;

function timingFixture(options: FixtureOptions = {}) {
  const identities = new DeviceRenderTimingIdentities("timing-device");
  const telemetry = new FrameTelemetryStore(identities.deviceScopeId, { frameCapacity: 32 });
  const renderer = {} as Renderer;
  const lane = options.lane ?? laneStub((_, task) => {
    task(renderer);
    return "submitted";
  });
  const resolveRenderTimestamps = options.resolve ?? vi.fn(async () => 2.5);
  const controller = createThreeAggregateGpuTimingController({
    timestampQuerySupported: options.supported ?? true,
    lane: options.supported === false ? null : lane,
    identities,
    telemetry,
    sampleIntervalMilliseconds: options.sampleIntervalMilliseconds,
    onError: options.onError,
  }, { resolveRenderTimestamps });

  return {
    controller,
    identities,
    lane,
    resolveRenderTimestamps,
    telemetry,
    recordSubmission(submittedAtMilliseconds: number): ThreeAggregateGpuTimingAnchor {
      const opportunityId = identities.nextRafOpportunity();
      telemetry.recordRafOpportunity({ opportunityId, timestampMilliseconds: submittedAtMilliseconds });
      const attemptId = identities.nextRenderAttempt();
      telemetry.recordRenderAttempt({
        attemptId,
        opportunityId,
        simulationRevisionId: null,
        attemptedAtMilliseconds: submittedAtMilliseconds,
      });
      const submissionId = identities.nextRenderSubmission();
      telemetry.recordRenderSubmission({
        attemptId,
        submissionId,
        queueEpochId: identities.nextQueueEpoch(),
        submittedAtMilliseconds,
      });
      return { submissionId, opportunityId, submittedAtMilliseconds };
    },
  };
}

function laneStub(
  request: ThreeWebGpuDeviceTaskLane["request"],
): ThreeWebGpuDeviceTaskLane {
  return { name: "gpu-timing", request, dispose: vi.fn() };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
