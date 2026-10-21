import type { SurfaceAdmissionDisposition } from "../runtime/submission/fair-surface-admission-coordinator";
import type { FrameTelemetryStoreOptions, FrameTelemetryStore } from "../runtime/telemetry/frame-telemetry-store";
import type {
  DeviceRenderTimingIdentities,
  RafOpportunityId,
} from "../runtime/telemetry/render-timing-identities";
import type { ThreeAggregateGpuTimingAnchor } from "./three-webgpu/telemetry/three-aggregate-gpu-timing-contract";
import type { ThreeWebGpuRenderSubmission } from "./three-webgpu-render-host";

export type ThreeWebGpuSessionAdmissionLane = Readonly<{
  name: string;
  request: (
    opportunity: RafOpportunityId,
    submission: ThreeWebGpuRenderSubmission,
  ) => SurfaceAdmissionDisposition;
  dispose: () => void;
}>;

export type ThreeWebGpuSessionAdmissionOptions = Readonly<{
  deviceScopeId: string;
  device: GPUDevice;
  rendererAvailable: () => boolean;
  onOwnershipDispose: () => void;
  telemetry?: FrameTelemetryStoreOptions;
  maxEpochsInFlight?: number;
  clockMilliseconds: () => number;
  onError?: (error: unknown) => void;
}>;

export type ThreeWebGpuTimingTelemetryAccess = Readonly<{
  identities: Pick<DeviceRenderTimingIdentities, "deviceScopeId" | "nextGpuPassSample">;
  telemetry: Pick<FrameTelemetryStore, "deviceScopeId" | "recordGpuPassSample">;
}>;

export type ThreeWebGpuSurfaceSubmissionObserver = (
  anchor: ThreeAggregateGpuTimingAnchor,
) => void;
