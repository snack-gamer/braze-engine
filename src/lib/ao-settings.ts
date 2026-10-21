import { defaultEnvironment } from "../constants";
import type { AmbientOcclusionSettings } from "../rendering/domain/gi-settings";

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeAmbientOcclusionSettings(raw: unknown): AmbientOcclusionSettings {
  const fallback = defaultEnvironment.ao;
  const source =
    raw && typeof raw === "object" ? (raw as Partial<AmbientOcclusionSettings>) : {};
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallback.enabled,
    intensity: clamp(finiteNumber(source.intensity, fallback.intensity), 0, 1),
    radius: clamp(finiteNumber(source.radius, fallback.radius), 0.05, 2),
    samples: Math.round(clamp(finiteNumber(source.samples, fallback.samples), 4, 32)),
    thickness: clamp(finiteNumber(source.thickness, fallback.thickness), 0.25, 2),
    distanceFalloff: clamp(finiteNumber(source.distanceFalloff, fallback.distanceFalloff), 0, 1),
  };
}
