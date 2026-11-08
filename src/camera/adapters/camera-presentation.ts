import { Color } from "three";
import type { CameraSettings } from "../../scene/domain/camera";
import type { Runtime } from "../../three/runtime";
import { DEFAULT_CAMERA_SETTINGS } from "../domain/camera-settings";
import { applyRenderCameraLens, OrthographicRenderCamera } from "./render-camera";
import { setCameraCullingMask } from "./camera-culling";

const presentations = new WeakMap<Runtime, { settings: CameraSettings; background: Color }>();
export function cameraPresentation(runtime: Runtime): CameraSettings {
  return presentations.get(runtime)?.settings ?? { ...DEFAULT_CAMERA_SETTINGS, fov: runtime.camera.fov,
    near: runtime.camera.near, far: runtime.camera.far,
    projection: runtime.camera instanceof OrthographicRenderCamera ? "orthographic" : "perspective",
    orthographicSize: runtime.camera instanceof OrthographicRenderCamera ? runtime.camera.orthographicSize : 5 };
}
export function applyCameraPresentation(runtime: Runtime, settings: CameraSettings): void {
  applyRenderCameraLens(runtime.camera, settings);
  setCameraCullingMask(runtime, settings.cullingMask ?? 0xffffffff);
  const state = presentations.get(runtime) ?? { settings, background: new Color() };
  state.settings = settings; state.background.set(settings.backgroundColor ?? DEFAULT_CAMERA_SETTINGS.backgroundColor);
  presentations.set(runtime, state);
  runtime.renderPipeline?.setCameraBackground?.(settings.background !== "solid");
}
/** Only the display draw changes its background; probes retain environment lighting. */
export function withCameraBackground(runtime: Runtime | null, render: () => void): void {
  const state = runtime && presentations.get(runtime);
  if (!runtime || !state || state.settings.background !== "solid") { render(); return; }
  const background = runtime.scene.background;
  runtime.scene.background = state.background;
  runtime.sky?.setBackgroundVisible?.(false);
  try { render(); } finally { runtime.scene.background = background; runtime.sky?.setBackgroundVisible?.(true); }
}
