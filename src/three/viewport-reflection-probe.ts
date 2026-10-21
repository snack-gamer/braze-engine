import type { MutableRefObject } from "react";
import type { BrowserThreeWebGpuRenderSession } from "../rendering/adapters/browser-three-webgpu-session";
import { createThreeReflectionProbeSessionLane } from "../rendering/adapters/three-webgpu/reflections/three-reflection-probe-session-lane";
import { markSceneDirty, type Runtime } from "./runtime";

/** Wires one scene probe into the app-owned device session and runtime lifetime. */
export function createViewportReflectionProbe(
  renderSession: BrowserThreeWebGpuRenderSession,
  renderSurfaceName: string,
  runtimeRef: MutableRefObject<Runtime | null>,
) {
  return createThreeReflectionProbeSessionLane({
    lane: renderSession.registerDeviceTaskLane(`${renderSurfaceName}:reflection-probe`),
    events: {
      onCaptureCompleted: ({ texture }) => {
        const runtime = runtimeRef.current;
        if (!runtime || runtime.disposed || !runtime.sky) return;
        runtime.scene.environment = texture;
        markSceneDirty(runtime);
      },
      onError: (error) => {
        console.error("[environment] Reflection probe capture failed", error);
      },
    },
  });
}
