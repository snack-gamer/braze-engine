import * as THREE from "three";
import { WebGPURenderer, type Renderer } from "three/webgpu";
import { installThreeR184NestedLighting } from "../rendering/adapters/three-r184-nested-lighting";

export type ViewportRenderer = Renderer;
export type ViewportRendererBackend = "webgpu";

export type ViewportRendererHandle = {
  renderer: ViewportRenderer;
  backend: ViewportRendererBackend;
  ready: Promise<void>;
};

export type ViewportRendererOptions = {
  antialias?: boolean;
  canvas?: HTMLCanvasElement;
  device?: GPUDevice;
  powerPreference?: "low-power" | "high-performance";
  trackTimestamp?: boolean;
};

export function createViewportRenderer(options: ViewportRendererOptions = {}): ViewportRendererHandle {
  const hasWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
  if (!hasWebGpu) {
    throw new Error("WebGPU is required for the viewport renderer.");
  }
  const renderer = new WebGPURenderer({
    // MSAA multiplies the cost of every WebGPU pass. Interactive viewports
    // favor responsive authoring; a future export path can opt in explicitly.
    antialias: options.antialias ?? false,
    alpha: false,
    ...(options.canvas ? { canvas: options.canvas } : {}),
    ...(options.device ? { device: options.device } : {}),
    ...(options.powerPreference ? { powerPreference: options.powerPreference } : {}),
    ...(options.trackTimestamp !== undefined ? { trackTimestamp: options.trackTimestamp } : {}),
  });
  installThreeR184NestedLighting(renderer);
  return {
    renderer,
    backend: "webgpu",
    ready: renderer.init().then(() => undefined),
  };
}

export function webGpuDeviceFor(renderer: ViewportRenderer): GPUDevice | null {
  const backend = renderer.backend as { device?: GPUDevice | null; isWebGPUBackend?: boolean } | undefined;
  const device = backend?.device ?? null;
  if (!device) return null;
  if (backend?.isWebGPUBackend !== true && typeof device.createBuffer !== "function") return null;
  return device;
}

export function webGpuDepthFormatFor(renderer: ViewportRenderer): GPUTextureFormat | undefined {
  const reversed = (renderer as { reversedDepthBuffer?: boolean }).reversedDepthBuffer === true;
  return reversed ? "depth32float" : "depth24plus";
}

export function webGpuColorFormatFor(renderer: ViewportRenderer): GPUTextureFormat {
  const internals = renderer as unknown as {
    getOutputBufferType?: () => number;
    needsFrameBufferTarget?: boolean;
  };
  if (internals.needsFrameBufferTarget === true) {
    const outputType = internals.getOutputBufferType?.();
    if (outputType === THREE.HalfFloatType) return "rgba16float";
    if (outputType === THREE.FloatType) return "rgba32float";
    return "rgba8unorm";
  }
  return preferredCanvasFormat();
}

export function webGpuSampleCountFor(renderer: ViewportRenderer): number {
  const internals = renderer as unknown as { _samples?: number; currentSamples?: number };
  const samples = internals._samples ?? internals.currentSamples;
  return typeof samples === "number" && samples >= 4 ? 4 : 1;
}

function preferredCanvasFormat(): GPUTextureFormat {
  return typeof navigator !== "undefined" && "gpu" in navigator
    ? navigator.gpu.getPreferredCanvasFormat()
    : "bgra8unorm";
}
