import type {
  DiagnosticNumber,
  FrameTelemetryDiagnosticProjection,
} from "../rendering/runtime/telemetry/frame-telemetry-diagnostic-projection";
import { THREE_AGGREGATE_GPU_TIMING_PASS_ID } from "../rendering/adapters/three-webgpu/telemetry/three-aggregate-gpu-timing-contract";
import {
  formatBytes,
  formatCompactCount,
  type ViewportStatsSnapshot,
} from "./viewport-stats";

export type ViewportHudReadout = Readonly<{
  label: string;
  value: string;
  detail: string;
  availability: "available" | "unavailable";
}>;

export type ViewportHudModel = Readonly<{
  rafOpportunity: ViewportHudReadout;
  submitted: ViewportHudReadout;
  queueRetired: ViewportHudReadout;
  gpuRenderWindow: ViewportHudReadout;
  memory: ViewportHudReadout;
  meshes: ViewportHudReadout;
  vertices: ViewportHudReadout;
  finalSize: ViewportHudReadout;
  render: ViewportHudReadout;
  gpuResources: ViewportHudReadout;
}>;

/**
 * Adapts retained render telemetry and current renderer stats into immutable HUD copy.
 */
export function createViewportHudModel(
  stats: ViewportStatsSnapshot,
  telemetry: FrameTelemetryDiagnosticProjection | null,
): ViewportHudModel {
  return Object.freeze({
    rafOpportunity: timingReadout(
      "RAF opportunity",
      telemetry?.rates.rafOpportunityHz ?? null,
      telemetry === null ? null : `${telemetry.counts.rafOpportunities} retained opportunities`,
    ),
    submitted: timingReadout(
      "Device work",
      telemetry?.rates.submittedHz ?? null,
      telemetry === null ? null : submissionDetail(telemetry),
    ),
    queueRetired: timingReadout(
      "Queue retired",
      telemetry?.rates.gpuRetirementHz ?? null,
      telemetry === null ? null : queueDetail(telemetry),
    ),
    gpuRenderWindow: gpuRenderWindowReadout(telemetry),
    memory: stats.heap === null
      ? unavailable("JS heap", "Browser heap telemetry unavailable")
      : available(
          "JS heap",
          formatHeadlineBytes(stats.heap.usedBytes),
          stats.heap.limitBytes ? `${formatBytes(stats.heap.limitBytes)} max` : "JS heap used",
        ),
    meshes: available(
      "Meshes",
      formatCompactCount(stats.meshes),
      `${formatCompactCount(stats.instances)} inst.`,
    ),
    vertices: available("Verts", formatCompactCount(stats.vertices), "visible"),
    finalSize: available(
      "Final",
      `${stats.outputWidth} × ${stats.outputHeight}`,
      `${trimDecimal(stats.pixelRatio, 2)}× pixel ratio`,
    ),
    render: available(
      "Render",
      `${formatCompactCount(stats.triangles)} tris`,
      `${formatCompactCount(stats.drawCalls)} draw call${stats.drawCalls === 1 ? "" : "s"}`,
    ),
    gpuResources: available(
      "GPU memory",
      formatHeadlineBytes(stats.gpuMemory.totalBytes),
      `${formatCompactCount(stats.geometries)} geometries · ${formatCompactCount(stats.textures)} textures · ${formatCompactCount(stats.gpuMemory.renderTargets)} targets`,
    ),
  });
}

function timingReadout(
  label: string,
  metric: DiagnosticNumber | null,
  availableDetail: string | null,
): ViewportHudReadout {
  if (metric === null) return unavailable(label, "Telemetry unavailable");
  if (metric.status === "unavailable") return unavailable(label, "Insufficient retained samples");
  return available(label, `${trimDecimal(metric.value, 1)} Hz`, availableDetail ?? "Telemetry available");
}

function submissionDetail(telemetry: FrameTelemetryDiagnosticProjection): string {
  const count = telemetry.counts.submittedRenderAttempts;
  const ratio = telemetry.submissionRatio.status === "available"
    ? `${Math.round(telemetry.submissionRatio.value * 100)}% accepted`
    : "ratio unavailable";
  return `${count} admitted · ${ratio} · ${telemetry.counts.rejectedRenderAttempts} rejected/${telemetry.counts.coalescedRenderAttempts} coalesced`;
}

function queueDetail(telemetry: FrameTelemetryDiagnosticProjection): string {
  return `${telemetry.counts.retiredRenderSubmissions} retired · ${telemetry.counts.inFlightRenderSubmissions} in flight · ${telemetry.counts.pendingRenderAttempts} pending`;
}

function gpuRenderWindowReadout(
  telemetry: FrameTelemetryDiagnosticProjection | null,
): ViewportHudReadout {
  if (telemetry === null) return unavailable("GPU render window", "Telemetry unavailable");
  if (telemetry.gpuPassTiming.status === "unavailable") {
    return unavailable("GPU render window", "Timestamp samples unavailable");
  }
  const timing = telemetry.gpuPassTiming.passes.find(
    (pass) => pass.passId === THREE_AGGREGATE_GPU_TIMING_PASS_ID,
  );
  if (!timing) return unavailable("GPU render window", "Aggregate timestamp samples unavailable");
  return available(
    "GPU render window",
    `${trimDecimal(timing.p50Milliseconds, 2)} ms p50`,
    `${timing.sampleCount} retained · p95 ${trimDecimal(timing.p95Milliseconds, 2)} ms`,
  );
}

function available(label: string, value: string, detail: string): ViewportHudReadout {
  return Object.freeze({ label, value, detail, availability: "available" });
}

function unavailable(label: string, detail: string): ViewportHudReadout {
  return Object.freeze({ label, value: "—", detail, availability: "unavailable" });
}

function trimDecimal(value: number, precision: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(precision).replace(/0+$/, "").replace(/\.$/, "");
}

function formatHeadlineBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}G`;
  if (bytes >= 100 * 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)}M`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)}M`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}K`;
  return `${Math.round(bytes)}B`;
}
