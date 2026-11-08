import type { CameraSettings } from "../../scene/domain/camera";

export const DEFAULT_CAMERA_SETTINGS: Required<CameraSettings> = {
  target: [0, 0.5, 0], fov: 52, near: 0.1, far: 200,
  projection: "perspective", fovAxis: "vertical", orthographicSize: 5,
  cullingMask: 0xffffffff, background: "environment", backgroundColor: "#20242b",
};

/** One authoring boundary, shared by tools and the Inspector. Metres and degrees. */
export function captureCameraSettings(value: CameraSettings): Required<CameraSettings> {
  const next = { ...DEFAULT_CAMERA_SETTINGS, ...value };
  if (!Array.isArray(next.target) || next.target.length !== 3 || !next.target.every(Number.isFinite)) throw new Error("Camera target requires three finite numbers.");
  for (const [key, min, max] of [["fov", 1, 179], ["near", 0.001, 1e6], ["far", 0.002, 1e7], ["orthographicSize", 0.001, 1e6]] as const) {
    if (!Number.isFinite(next[key]) || next[key] < min || next[key] > max) throw new Error(`Camera ${key} must be between ${min} and ${max}.`);
  }
  if (next.far <= next.near) throw new Error("Camera far clipping plane must be greater than its near plane.");
  if (!["perspective", "orthographic"].includes(next.projection)) throw new Error("Unknown camera projection.");
  if (!["vertical", "horizontal"].includes(next.fovAxis)) throw new Error("Unknown camera FOV axis.");
  if (!Number.isInteger(next.cullingMask) || next.cullingMask < 0 || next.cullingMask > 0xffffffff) throw new Error("Camera culling mask must be an unsigned 32-bit integer.");
  if (!["environment", "solid"].includes(next.background)) throw new Error("Unknown camera background mode.");
  if (!/^#[0-9a-f]{6}$/i.test(next.backgroundColor)) throw new Error("Camera background color must use #rrggbb.");
  return { ...next, target: [...next.target] };
}

export function cameraVerticalFov(fov: number, axis: CameraSettings["fovAxis"], aspect: number): number {
  return axis === "horizontal" ? 2 * Math.atan(Math.tan(fov * Math.PI / 360) / Math.max(1e-6, aspect)) * 180 / Math.PI : fov;
}
export function cameraIncludesLayer(mask: number, layer = 0): boolean { return ((mask >>> layer) & 1) !== 0; }

export function captureCameraPatch(value: unknown): Partial<CameraSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Camera settings must be an object.");
  const patch = value as Record<string, unknown>;
  for (const key of Object.keys(patch)) if (!Object.prototype.hasOwnProperty.call(DEFAULT_CAMERA_SETTINGS, key)) throw new Error(`Unknown camera setting: ${key}`);
  const merged = { ...DEFAULT_CAMERA_SETTINGS, ...patch } as CameraSettings;
  // A partial clip edit is validated against the existing camera at application.
  if (patch.near !== undefined && patch.far === undefined && typeof patch.near === "number") merged.far = Math.max(DEFAULT_CAMERA_SETTINGS.far, patch.near + 1);
  if (patch.far !== undefined && patch.near === undefined && typeof patch.far === "number") merged.near = Math.min(DEFAULT_CAMERA_SETTINGS.near, patch.far / 2);
  captureCameraSettings(merged);
  return { ...patch, ...(Array.isArray(patch.target) ? { target: [...patch.target] } : {}) } as Partial<CameraSettings>;
}
