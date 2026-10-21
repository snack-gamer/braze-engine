import { describe, expect, it } from "vitest";
import { FrameTelemetryDiagnosticProjector } from "../rendering/runtime/telemetry/frame-telemetry-diagnostic-projection";
import { FrameTelemetryStore } from "../rendering/runtime/telemetry/frame-telemetry-store";
import { DeviceRenderTimingIdentities } from "../rendering/runtime/telemetry/render-timing-identities";
import { createViewportHudModel } from "./viewport-hud-model";
import type { ViewportStatsSnapshot } from "./viewport-stats";

describe("viewport HUD model", () => {
  it("labels callback, submission, and queue retirement cadence independently", () => {
    const telemetry = populatedTelemetry();
    const model = createViewportHudModel(viewportStats(), telemetry);

    expect(model.rafOpportunity).toEqual({
      label: "RAF opportunity",
      value: "50 Hz",
      detail: "5 retained opportunities",
      availability: "available",
    });
    expect(model.submitted).toEqual({
      label: "Device work",
      value: "40 Hz",
      detail: "3 admitted · 75% accepted · 1 rejected/1 coalesced",
      availability: "available",
    });
    expect(model.queueRetired).toEqual({
      label: "Queue retired",
      value: "20 Hz",
      detail: "2 retired · 1 in flight · 1 pending",
      availability: "available",
    });
    expect(model.gpuRenderWindow).toEqual({
      label: "GPU render window",
      value: "4 ms p50",
      detail: "2 retained · p95 6 ms",
      availability: "available",
    });
    expect(model).toMatchObject({
      memory: { label: "JS heap", value: "220M", detail: "4.0 GB max" },
      meshes: { value: "8", detail: "12 inst." },
      vertices: { value: "153k", detail: "visible" },
      finalSize: { value: "3840 × 2160", detail: "1.25× pixel ratio" },
      render: { value: "528k tris", detail: "528 draw calls" },
      gpuResources: {
        label: "GPU memory",
        value: "192M",
        detail: "21 geometries · 17 textures · 6 targets",
      },
    });
    expectDeepFrozen(model);
    expect(JSON.stringify(model)).not.toMatch(/FPS|Frame Rate|presented/i);
  });

  it("keeps telemetry and browser memory unavailability explicit", () => {
    const stats = { ...viewportStats(), heap: null };
    const disconnected = createViewportHudModel(stats, null);
    for (const timing of [
      disconnected.rafOpportunity,
      disconnected.submitted,
      disconnected.queueRetired,
    ]) {
      expect(timing).toMatchObject({
        value: "—",
        detail: "Telemetry unavailable",
        availability: "unavailable",
      });
    }
    expect(disconnected.memory).toEqual({
      label: "JS heap",
      value: "—",
      detail: "Browser heap telemetry unavailable",
      availability: "unavailable",
    });
    expect(disconnected.gpuRenderWindow).toEqual({
      label: "GPU render window",
      value: "—",
      detail: "Telemetry unavailable",
      availability: "unavailable",
    });

    const emptyStore = new FrameTelemetryStore("empty-hud-device", { frameCapacity: 2 });
    const insufficient = createViewportHudModel(
      stats,
      new FrameTelemetryDiagnosticProjector(emptyStore).project(),
    );
    expect(insufficient.rafOpportunity).toMatchObject({
      value: "—",
      detail: "Insufficient retained samples",
      availability: "unavailable",
    });
    expect(insufficient.gpuRenderWindow).toMatchObject({
      value: "—",
      detail: "Timestamp samples unavailable",
      availability: "unavailable",
    });
  });
});

function populatedTelemetry() {
  const ids = new DeviceRenderTimingIdentities("hud-device");
  const store = new FrameTelemetryStore(ids.deviceScopeId, { frameCapacity: 8 });
  const opportunities = [0, 20, 40, 60, 80].map((timestampMilliseconds) => {
    const opportunityId = ids.nextRafOpportunity();
    store.recordRafOpportunity({ opportunityId, timestampMilliseconds });
    return opportunityId;
  });

  const first = recordSubmittedAttempt(store, ids, opportunities[0], 1);
  const second = recordSubmittedAttempt(store, ids, opportunities[1], 26);
  recordSubmittedAttempt(store, ids, opportunities[2], 51);
  store.recordGpuPassSample({
    sampleId: ids.nextGpuPassSample(),
    submissionId: first.submissionId,
    passId: "three-render-aggregate-window",
    durationMilliseconds: 4,
  });
  store.recordGpuPassSample({
    sampleId: ids.nextGpuPassSample(),
    submissionId: second.submissionId,
    passId: "three-render-aggregate-window",
    durationMilliseconds: 6,
  });
  store.recordQueueRetirement({ queueEpochId: first.queueEpochId, retiredAtMilliseconds: 6 });
  store.recordQueueRetirement({ queueEpochId: second.queueEpochId, retiredAtMilliseconds: 56 });

  const rejectedAttempt = ids.nextRenderAttempt();
  store.recordRenderAttempt({
    attemptId: rejectedAttempt,
    opportunityId: opportunities[3],
    simulationRevisionId: null,
    attemptedAtMilliseconds: 60,
  });
  store.recordRenderRejection({ attemptId: rejectedAttempt, reason: "superseded" });
  store.recordRenderAttempt({
    attemptId: ids.nextRenderAttempt(),
    opportunityId: opportunities[4],
    simulationRevisionId: null,
    attemptedAtMilliseconds: 80,
  });
  return new FrameTelemetryDiagnosticProjector(store).project();
}

function recordSubmittedAttempt(
  store: FrameTelemetryStore,
  ids: DeviceRenderTimingIdentities,
  opportunityId: ReturnType<DeviceRenderTimingIdentities["nextRafOpportunity"]>,
  submittedAtMilliseconds: number,
) {
  const attemptId = ids.nextRenderAttempt();
  const queueEpochId = ids.nextQueueEpoch();
  store.recordRenderAttempt({
    attemptId,
    opportunityId,
    simulationRevisionId: null,
    attemptedAtMilliseconds: submittedAtMilliseconds - 1,
  });
  const submissionId = ids.nextRenderSubmission();
  store.recordRenderSubmission({
    attemptId,
    submissionId,
    queueEpochId,
    submittedAtMilliseconds,
  });
  return { queueEpochId, submissionId };
}

function viewportStats(): ViewportStatsSnapshot {
  return {
    heap: { usedBytes: 220 * 1024 ** 2, limitBytes: 4 * 1024 ** 3 },
    meshes: 8,
    instances: 12,
    vertices: 153_000,
    triangles: 528_000,
    drawCalls: 528,
    geometries: 21,
    textures: 17,
    gpuMemory: {
      totalBytes: 192 * 1024 ** 2,
      textureBytes: 128 * 1024 ** 2,
      renderTargets: 6,
    },
    outputWidth: 3840,
    outputHeight: 2160,
    pixelRatio: 1.25,
    backend: "webgpu",
  };
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}
