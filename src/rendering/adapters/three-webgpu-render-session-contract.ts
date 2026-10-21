import type { RendererFailureDiagnostic } from "../../three/device-lifecycle";
import type { ViewportRendererOptions } from "../../three/renderer";
import type { SurfaceAdmissionDisposition } from "../runtime/submission/fair-surface-admission-coordinator";
import type { FrameTelemetrySummary } from "../runtime/telemetry/frame-telemetry-aggregator";
import type { FrameTelemetryDiagnosticProjection } from "../runtime/telemetry/frame-telemetry-diagnostic-projection";
import type { FrameTelemetryStoreOptions } from "../runtime/telemetry/frame-telemetry-store";
import type { RafOpportunityId } from "../runtime/telemetry/render-timing-identities";
import type { createThreeAggregateGpuTimingController } from "./three-webgpu/telemetry/three-aggregate-gpu-timing-controller";
import type {
  ThreeWebGpuRenderHost,
  ThreeWebGpuRenderHostOptions,
  ThreeWebGpuRenderHostStatus,
  ThreeWebGpuRendererConfiguration,
  ThreeWebGpuRenderSubmission,
  ThreeWebGpuSurfaceSize,
} from "./three-webgpu-render-host";

export type DeviceRenderOpportunity = RafOpportunityId;
export type ThreeWebGpuRenderRequestDisposition = SurfaceAdmissionDisposition;

export type ThreeWebGpuSessionSurface = Readonly<{
  name: string;
  configure: (configuration: ThreeWebGpuRendererConfiguration) => boolean;
  request: (
    opportunity: DeviceRenderOpportunity,
    submission: ThreeWebGpuRenderSubmission,
  ) => ThreeWebGpuRenderRequestDisposition;
  resize: (size: ThreeWebGpuSurfaceSize) => boolean;
  dispose: () => void;
}>;

export type ThreeWebGpuDeviceTaskLane = Readonly<{
  name: string;
  request: (
    opportunity: DeviceRenderOpportunity,
    task: ThreeWebGpuRenderSubmission,
  ) => ThreeWebGpuRenderRequestDisposition;
  dispose: () => void;
}>;

export type ThreeWebGpuRenderSession = Readonly<{
  ready: Promise<void>;
  getStatus: () => ThreeWebGpuRenderHostStatus;
  opportunityForFrame: (
    frameIndex: number,
    timestampMilliseconds: number,
  ) => DeviceRenderOpportunity;
  registerSurface: (
    name: string,
    canvas: HTMLCanvasElement | OffscreenCanvas,
  ) => ThreeWebGpuSessionSurface;
  registerDeviceTaskLane: (name: string) => ThreeWebGpuDeviceTaskLane;
  /** Resource retirement only: includes the current admitted submission and earlier draws. */
  retireResources: () => Promise<void>;
  diagnostics: () => FrameTelemetryDiagnosticProjection;
  summarize: () => FrameTelemetrySummary;
  dispose: () => void;
  disposeAsync: () => Promise<void>;
}>;

export type ThreeWebGpuRenderSessionOptions = Readonly<{
  deviceScopeId: string;
  device: GPUDevice;
  /** Explicit diagnostic policy after adapter capability negotiation. */
  gpuTimingEnabled: boolean;
  rendererOptions?: Omit<ViewportRendererOptions, "canvas" | "device" | "trackTimestamp">;
  telemetry?: FrameTelemetryStoreOptions;
  maxEpochsInFlight?: number;
  clockMilliseconds?: () => number;
  onRendererFailure?: (diagnostic: RendererFailureDiagnostic) => void;
  onError?: (error: unknown) => void;
}>;

export type ThreeWebGpuRenderSessionDependencies = Readonly<{
  createRenderHost: (options: ThreeWebGpuRenderHostOptions) => ThreeWebGpuRenderHost;
  createGpuTimingController?: typeof createThreeAggregateGpuTimingController;
}>;
