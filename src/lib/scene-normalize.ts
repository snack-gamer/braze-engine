import { defaultCamera, defaultCameraSettings, defaultEnvironment, seedCameraId } from "../constants";
import { normalizeAmbientOcclusionSettings } from "./ao-settings";
import { normalizeSkySettings } from "./sky-settings";
import { normalizeScreenSpaceReflectionSettings } from "./ssr-settings";
import {
  type CameraState,
  type EnvironmentSettings,
  type SceneObject,
} from "../types";

export function normalizeCamera(raw: unknown): CameraState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const fov = typeof obj.fov === "number"
    ? obj.fov
    : typeof obj.fov_degrees === "number"
      ? obj.fov_degrees
      : defaultCamera.fov;
  const position = Array.isArray(obj.position) ? (obj.position as CameraState["position"]) : defaultCamera.position;
  const target = Array.isArray(obj.target) ? (obj.target as CameraState["target"]) : defaultCamera.target;
  return { position, target, fov };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeEnvironmentRanges(env: EnvironmentSettings): EnvironmentSettings {
  const worldSource = env.worldSource === "sky" || env.worldSource === "hdri"
    ? env.worldSource
    : defaultEnvironment.worldSource;
  return {
    hdriUrl: env.hdriUrl,
    hdriName: env.hdriName,
    intensity: clampNumber(env.intensity, 0, 2, defaultEnvironment.intensity),
    rotationDeg: clampNumber(env.rotationDeg, -180, 180, defaultEnvironment.rotationDeg),
    exposureEv: clampNumber(env.exposureEv, -2, 2, defaultEnvironment.exposureEv),
    toneMapping: env.toneMapping,
    worldSource,
    hueShiftDeg: clampNumber(env.hueShiftDeg, -90, 90, defaultEnvironment.hueShiftDeg),
    saturation: clampNumber(env.saturation, -0.5, 0.75, defaultEnvironment.saturation),
    brightness: clampNumber(env.brightness, -0.35, 0.35, defaultEnvironment.brightness),
    contrast: clampNumber(env.contrast, -0.5, 0.75, defaultEnvironment.contrast),
    bloom: env.bloom,
    bloomIntensity: clampNumber(env.bloomIntensity, 0, 1.25, defaultEnvironment.bloomIntensity),
    bloomThreshold: clampNumber(env.bloomThreshold, 0.2, 1, defaultEnvironment.bloomThreshold),
    bloomSmoothing: clampNumber(env.bloomSmoothing, 0, 0.75, defaultEnvironment.bloomSmoothing),
    bloomRadius: clampNumber(env.bloomRadius, 0, 1, defaultEnvironment.bloomRadius),
    sky: normalizeSkySettings(env.sky),
    ao: normalizeAmbientOcclusionSettings(env.ao),
    ssr: normalizeScreenSpaceReflectionSettings(env.ssr),
  };
}

export function normalizeEnvironment(raw: unknown): EnvironmentSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const legacy = raw as Partial<EnvironmentSettings> & {
    backgroundMode?: unknown;
    worldSource?: unknown;
  };
  const worldSource: EnvironmentSettings["worldSource"] =
    legacy.worldSource === "sky" || legacy.backgroundMode === "sky" ? "sky" : "hdri";
  const merged: EnvironmentSettings = { ...defaultEnvironment, ...legacy, worldSource };
  if (merged.worldSource !== "hdri" && merged.worldSource !== "sky") {
    merged.worldSource = "hdri";
  }
  return normalizeEnvironmentRanges(merged);
}

export function migrateLegacyCamera(objects: SceneObject[], camera: CameraState | undefined): {
  objects: SceneObject[];
  activeCameraId: string;
} {
  const existing = objects.find((o) => o.primitive === "camera");
  if (existing) {
    return { objects, activeCameraId: existing.id };
  }
  const synthesized: SceneObject = {
    id: seedCameraId,
    name: "Camera 1",
    primitive: "camera",
    color: "#a4b6c7",
    visible: true,
    locked: false,
    position: camera?.position ?? defaultCamera.position,
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    camera: {
      ...defaultCameraSettings,
      target: camera?.target ?? defaultCameraSettings.target,
      fov: camera?.fov ?? defaultCameraSettings.fov,
    },
  };
  return { objects: [synthesized, ...objects], activeCameraId: synthesized.id };
}
