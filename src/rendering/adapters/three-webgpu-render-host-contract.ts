import type { CanvasTarget } from "three/webgpu";
import type { RendererFailureDiagnostic } from "../../three/device-lifecycle";
import type {
  ViewportRenderer,
  ViewportRendererHandle,
  ViewportRendererOptions,
} from "../../three/renderer";
import type { ThreeRendererFrameOwnership } from "./three-renderer-frame-ownership";
import type { ThreeWebGpuSurfaceSize } from "./three-webgpu-surface-contract";

export type ThreeWebGpuRenderHostStatus =
  | "initializing"
  | "ready"
  | "failed"
  | "device-lost"
  | "disposed";

export type ThreeWebGpuRendererConfiguration = (renderer: ViewportRenderer) => void;

export type ThreeWebGpuSubmissionContext = Readonly<{
  /** The governor-owned fence for all queue work encoded by this callback. */
  retirement: Promise<"completed" | "failed" | "cancelled">;
}>;

export type ThreeWebGpuRenderSubmission = (
  renderer: ViewportRenderer,
  context?: ThreeWebGpuSubmissionContext,
) => void;

export type ThreeWebGpuRenderSurface = Readonly<{
  configure: (configuration: ThreeWebGpuRendererConfiguration) => boolean;
  render: (submission: ThreeWebGpuRenderSubmission, context?: ThreeWebGpuSubmissionContext) => boolean;
  resize: (size: ThreeWebGpuSurfaceSize) => boolean;
  dispose: () => void;
}>;

export type ThreeWebGpuRenderHost = Readonly<{
  ready: Promise<void>;
  getStatus: () => ThreeWebGpuRenderHostStatus;
  beginDeviceFrame: () => boolean;
  execute: (submission: ThreeWebGpuRenderSubmission, context?: ThreeWebGpuSubmissionContext) => boolean;
  registerSurface: (canvas: HTMLCanvasElement | OffscreenCanvas) => ThreeWebGpuRenderSurface;
  dispose: () => void;
}>;

export type ThreeWebGpuRenderHostOptions = Readonly<{
  rendererOptions?: Omit<ViewportRendererOptions, "canvas">;
  onFailure?: (diagnostic: RendererFailureDiagnostic) => void;
  onError?: (error: unknown) => void;
}>;

export type ThreeWebGpuRenderHostDependencies = Readonly<{
  createRenderer: (options: ViewportRendererOptions) => ViewportRendererHandle;
  createCanvasTarget: (canvas: HTMLCanvasElement | OffscreenCanvas) => CanvasTarget;
  deviceFor: (renderer: ViewportRenderer) => GPUDevice | null;
  claimFrameOwnership: (renderer: ViewportRenderer) => ThreeRendererFrameOwnership;
  observeDeviceLoss: (
    device: GPUDevice,
    onLost: (diagnostic: RendererFailureDiagnostic) => void,
  ) => () => void;
}>;
