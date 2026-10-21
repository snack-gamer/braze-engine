import { defaultEnvironment } from "../constants";
import type { ScreenSpaceReflectionSettings } from "../rendering/domain/gi-settings";

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeScreenSpaceReflectionSettings(raw: unknown): ScreenSpaceReflectionSettings {
  const fallback = defaultEnvironment.ssr;
  const source =
    raw && typeof raw === "object" ? (raw as Partial<ScreenSpaceReflectionSettings>) : {};
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallback.enabled,
    maxDistance: clamp(finiteNumber(source.maxDistance, fallback.maxDistance), 0.1, 50),
    thickness: clamp(finiteNumber(source.thickness, fallback.thickness), 0.01, 2),
    opacity: clamp(finiteNumber(source.opacity, fallback.opacity), 0, 1),
    quality: clamp(finiteNumber(source.quality, fallback.quality), 0, 1),
    blurQuality: Math.round(clamp(finiteNumber(source.blurQuality, fallback.blurQuality), 1, 3)),
  };
}
