import { CanvasTarget } from "three/webgpu";
import { observeGpuDeviceLoss } from "../../three/device-lifecycle";
import { createViewportRenderer, webGpuDeviceFor } from "../../three/renderer";
import { claimThreeRendererFrameOwnership } from "./three-renderer-frame-ownership";
import type { ThreeWebGpuRenderHostDependencies } from "./three-webgpu-render-host-contract";

export const DEFAULT_THREE_WEBGPU_RENDER_HOST_DEPENDENCIES: ThreeWebGpuRenderHostDependencies = {
  createRenderer: createViewportRenderer,
  createCanvasTarget: (canvas) => new CanvasTarget(canvas),
  deviceFor: webGpuDeviceFor,
  claimFrameOwnership: claimThreeRendererFrameOwnership,
  observeDeviceLoss: observeGpuDeviceLoss,
};
