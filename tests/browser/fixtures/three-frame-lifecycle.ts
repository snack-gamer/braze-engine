import * as THREE from "three";
import type { NodeFrame } from "three/webgpu";
import { defaultEnvironment } from "/src/constants";
import { createThreeWebGpuRenderSession } from "/src/rendering/adapters/three-webgpu-render-session";
import type {
  DeviceRenderOpportunity,
  ThreeWebGpuRenderSession,
  ThreeWebGpuSessionSurface,
} from "/src/rendering/adapters/three-webgpu-render-session-contract";
import { QuarterResolutionCloudNode } from "/src/rendering/adapters/three-webgpu/atmosphere/quarter-resolution-cloud-node";
import {
  createViewportRenderPipeline,
  type ViewportRenderPipeline,
} from "/src/rendering/adapters/three-webgpu/viewport-render-pipeline";

export type ThreeFrameLifecycleSnapshot = {
  frameId: number;
  renderId: number;
  rendererInfoFrame: number;
  time: number;
  deltaTime: number;
};

export type ThreeFrameLifecycleFixtureResult = {
  status: "passed" | "failed" | "unsupported";
  webgpu: boolean;
  atmosphereUpdates: ThreeFrameLifecycleSnapshot[];
  atmosphereUpdateCounts: number[];
  rendererFrames: number[];
  dispositions: string[];
  repeatedOpportunityWasStable?: boolean;
  rendererRafRequestsAtOwnership?: number;
  rendererRafCancellationsAtOwnership?: number;
  rendererRafRequestsDuringIdle?: number;
  rendererRafCallbacksDuringIdle?: number;
  validationErrors: string[];
  uncapturedErrors: string[];
  sessionErrors: string[];
  error?: string;
};

declare global {
  interface Window {
    __threeFrameLifecycleFixture?: ThreeFrameLifecycleFixtureResult;
  }
}

const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
let rendererRafRequests = 0;
let rendererRafCallbacks = 0;
let rendererRafCancellations = 0;

window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
  rendererRafRequests += 1;
  return nativeRequestAnimationFrame((time) => {
    rendererRafCallbacks += 1;
    callback(time);
  });
};
window.cancelAnimationFrame = (requestId: number): void => {
  rendererRafCancellations += 1;
  nativeCancelAnimationFrame(requestId);
};

function publish(result: ThreeFrameLifecycleFixtureResult): void {
  window.__threeFrameLifecycleFixture = result;
  const output = document.querySelector("#result");
  if (output) output.textContent = JSON.stringify(result, null, 2);
}

async function run(): Promise<void> {
  const validationErrors: string[] = [];
  const uncapturedErrors: string[] = [];
  const sessionErrors: string[] = [];
  const atmosphereUpdates: ThreeFrameLifecycleSnapshot[] = [];
  const atmosphereUpdateCounts: number[] = [];
  const rendererFrames: number[] = [];
  const dispositions: string[] = [];

  if (!navigator.gpu) {
    publish({
      status: "unsupported",
      webgpu: false,
      atmosphereUpdates,
      atmosphereUpdateCounts,
      rendererFrames,
      dispositions,
      validationErrors,
      uncapturedErrors,
      sessionErrors,
    });
    return;
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
    featureLevel: "compatibility",
  });
  if (!adapter) {
    publish({
      status: "unsupported",
      webgpu: false,
      atmosphereUpdates,
      atmosphereUpdateCounts,
      rendererFrames,
      dispositions,
      validationErrors,
      uncapturedErrors,
      sessionErrors,
      error: "No compatible WebGPU adapter was available.",
    });
    return;
  }

  const device = await adapter.requestDevice();
  device.addEventListener("uncapturederror", (event) => {
    uncapturedErrors.push(event.error.message);
  });
  device.pushErrorScope("validation");

  let session: ThreeWebGpuRenderSession | null = null;
  let surface: ThreeWebGpuSessionSurface | null = null;
  let pipeline: ViewportRenderPipeline | null = null;
  const originalCloudUpdate = QuarterResolutionCloudNode.prototype.updateBefore;
  QuarterResolutionCloudNode.prototype.updateBefore = function updateBefore(frame: NodeFrame) {
    atmosphereUpdates.push({
      frameId: frame.frameId,
      renderId: frame.renderId,
      rendererInfoFrame: frame.renderer?.info.frame ?? -1,
      time: frame.time,
      deltaTime: frame.deltaTime,
    });
    return originalCloudUpdate.call(this, frame);
  };

  try {
    session = createThreeWebGpuRenderSession({
      deviceScopeId: "browser-frame-lifecycle",
      device,
      gpuTimingEnabled: false,
      maxEpochsInFlight: 1,
      rendererOptions: {
        antialias: false,
        powerPreference: "high-performance",
      },
      onError: (error) => sessionErrors.push(errorMessage(error)),
    });
    await session.ready;

    const rendererRafRequestsAtOwnership = rendererRafRequests;
    const rendererRafCancellationsAtOwnership = rendererRafCancellations;
    const canvas = document.querySelector<HTMLCanvasElement>("#surface");
    if (!canvas) throw new Error("The lifecycle fixture canvas is missing.");
    surface = session.registerSurface("browser-frame-lifecycle", canvas);
    surface.resize({ width: 96, height: 64, pixelRatio: 1 });

    let renderer!: Parameters<ThreeWebGpuSessionSurface["configure"]>[0] extends (
      activeRenderer: infer T,
    ) => void ? T : never;
    surface.configure((activeRenderer) => {
      renderer = activeRenderer;
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 96 / 64, 0.1, 100);
    camera.position.set(0, 0, 4);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(2, 4, 3);
    scene.add(light, light.target);
    pipeline = createViewportRenderPipeline(renderer, scene, camera, light);
    pipeline.setSkyEffects({
      ...defaultEnvironment.sky,
      cloudsCoverage: Math.max(0.25, defaultEnvironment.sky.cloudsCoverage),
      godraysIntensity: 0,
    }, true);

    const firstOpportunity = session.opportunityForFrame(1, performance.now());
    submitFrame(surface, firstOpportunity, pipeline, rendererFrames, atmosphereUpdates, atmosphereUpdateCounts, dispositions);
    await waitForRetirement(session, 1);
    const repeatedFirstOpportunity = session.opportunityForFrame(1, performance.now());
    submitFrame(surface, repeatedFirstOpportunity, pipeline, rendererFrames, atmosphereUpdates, atmosphereUpdateCounts, dispositions);
    await waitForRetirement(session, 2);

    const rafRequestsBeforeIdle = rendererRafRequests;
    const rafCallbacksBeforeIdle = rendererRafCallbacks;
    await waitForBrowserFrames(6);
    const rendererRafRequestsDuringIdle = rendererRafRequests - rafRequestsBeforeIdle;
    const rendererRafCallbacksDuringIdle = rendererRafCallbacks - rafCallbacksBeforeIdle;

    const postIdleFirstOpportunity = session.opportunityForFrame(1, performance.now());
    submitFrame(surface, postIdleFirstOpportunity, pipeline, rendererFrames, atmosphereUpdates, atmosphereUpdateCounts, dispositions);
    await waitForRetirement(session, 3);
    const repeatedOpportunityWasStable = repeatedFirstOpportunity === firstOpportunity
      && postIdleFirstOpportunity === firstOpportunity;

    const secondOpportunity = session.opportunityForFrame(2, performance.now());
    submitFrame(surface, secondOpportunity, pipeline, rendererFrames, atmosphereUpdates, atmosphereUpdateCounts, dispositions);
    await waitForRetirement(session, 4);
    const repeatedSecondOpportunity = session.opportunityForFrame(2, performance.now());
    submitFrame(surface, repeatedSecondOpportunity, pipeline, rendererFrames, atmosphereUpdates, atmosphereUpdateCounts, dispositions);
    await waitForRetirement(session, 5);

    pipeline.dispose();
    pipeline = null;
    surface.dispose();
    surface = null;
    await session.disposeAsync();
    session = null;
    const validationError = await device.popErrorScope();
    if (validationError) validationErrors.push(validationError.message);

    publish({
      status: validationErrors.length === 0
        && uncapturedErrors.length === 0
        && sessionErrors.length === 0
        ? "passed"
        : "failed",
      webgpu: true,
      atmosphereUpdates,
      atmosphereUpdateCounts,
      rendererFrames,
      dispositions,
      repeatedOpportunityWasStable,
      rendererRafRequestsAtOwnership,
      rendererRafCancellationsAtOwnership,
      rendererRafRequestsDuringIdle,
      rendererRafCallbacksDuringIdle,
      validationErrors,
      uncapturedErrors,
      sessionErrors,
    });
  } catch (error) {
    pipeline?.dispose();
    surface?.dispose();
    await session?.disposeAsync().catch((disposeError) => {
      sessionErrors.push(errorMessage(disposeError));
    });
    const validationError = await device.popErrorScope().catch(() => null);
    if (validationError) validationErrors.push(validationError.message);
    publish({
      status: "failed",
      webgpu: true,
      atmosphereUpdates,
      atmosphereUpdateCounts,
      rendererFrames,
      dispositions,
      validationErrors,
      uncapturedErrors,
      sessionErrors,
      error: errorMessage(error),
    });
  } finally {
    QuarterResolutionCloudNode.prototype.updateBefore = originalCloudUpdate;
    window.requestAnimationFrame = nativeRequestAnimationFrame;
    window.cancelAnimationFrame = nativeCancelAnimationFrame;
    device.destroy();
  }
}

function submitFrame(
  surface: ThreeWebGpuSessionSurface,
  opportunity: DeviceRenderOpportunity,
  pipeline: ViewportRenderPipeline,
  rendererFrames: number[],
  atmosphereUpdates: ThreeFrameLifecycleSnapshot[],
  atmosphereUpdateCounts: number[],
  dispositions: string[],
): void {
  const disposition = surface.request(opportunity, (renderer) => {
    rendererFrames.push(renderer.info.frame);
    pipeline.render();
    atmosphereUpdateCounts.push(atmosphereUpdates.length);
  });
  dispositions.push(disposition);
  if (disposition !== "submitted") {
    throw new Error(`Expected immediate device-frame submission, received '${disposition}'.`);
  }
}

async function waitForRetirement(session: ThreeWebGpuRenderSession, count: number): Promise<void> {
  const deadline = performance.now() + 30_000;
  while (session.summarize().retiredRenderSubmissions < count) {
    if (performance.now() >= deadline) {
      throw new Error(`Timed out waiting for render submission ${count} to retire.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function waitForBrowserFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => nativeRequestAnimationFrame(() => resolve()));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void run();
