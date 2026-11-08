import type { CameraSettings } from "../../scene/domain/camera";
import { captureCameraSettings, DEFAULT_CAMERA_SETTINGS } from "../domain/camera-settings";

/** Additive v1 scene migration: old perspective cameras retain vertical FOV. */
export function decodeCameraSettings(raw: unknown): CameraSettings | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>, defaults = DEFAULT_CAMERA_SETTINGS;
  const numeric = (key: string, fallback: number) => {
    const number = typeof value[key] === "string" && String(value[key]).trim() ? Number(value[key]) : value[key];
    return typeof number === "number" && Number.isFinite(number) ? number : fallback;
  };
  const near = Math.min(1e6, Math.max(0.001, numeric("near", defaults.near)));
  const far = Math.min(1e7, Math.max(near + 0.001, numeric("far", defaults.far)));
  return captureCameraSettings({
    target: Array.isArray(value.target) && value.target.length === 3 && value.target.every(Number.isFinite) ? [...value.target] as CameraSettings["target"] : [...defaults.target],
    fov: Math.min(179, Math.max(1, numeric("fov_degrees", defaults.fov))), near, far,
    projection: value.projection === "orthographic" ? "orthographic" : "perspective",
    fovAxis: value.fov_axis === "horizontal" ? "horizontal" : "vertical",
    orthographicSize: Math.min(1e6, Math.max(0.001, numeric("orthographic_size", defaults.orthographicSize))),
    cullingMask: Number.isInteger(value.culling_mask) && Number(value.culling_mask) >= 0 && Number(value.culling_mask) <= 0xffffffff ? Number(value.culling_mask) : defaults.cullingMask,
    background: value.background === "solid" ? "solid" : "environment",
    backgroundColor: typeof value.background_color === "string" && /^#[0-9a-f]{6}$/i.test(value.background_color) ? value.background_color : defaults.backgroundColor,
  });
}
export function encodeCameraSettings(value: CameraSettings | undefined) {
  if (!value) return null;
  const camera = captureCameraSettings(value);
  return { target: camera.target, fov_degrees: camera.fov, near: camera.near, far: camera.far,
    projection: camera.projection, fov_axis: camera.fovAxis, orthographic_size: camera.orthographicSize,
    culling_mask: camera.cullingMask, background: camera.background, background_color: camera.backgroundColor };
}
