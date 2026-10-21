import type { WaterPreset, WaterQuality, WaterReflectionResolution, WaterSettings } from "./types";

export const WATER_PRESETS: Record<WaterPreset, WaterSettings> = {
  calm: {
    preset: "calm",
    quality: "auto",
    waterColor: "#269bb0",
    deepColor: "#061927",
    opacity: 0.9,
    reflectionResolution: 512,
    waveScale: 0.45,
    waveHeight: 0.35,
    waveSpeed: 0.45,
    distortion: 5.5,
    chopStrength: 0.6,
    chopScale: 1.0,
    chopHeight: 0.18,
    windDirection: 28,
    rippleStrength: 0.18,
    roughness: 0.38,
    highlightSize: 0.55,
    wetness: 0.55,
    depthBlend: 0.55,
    sunStrength: 0.95,
    peakFoam: 0.04,
    peakFoamColor: "#eefcff",
    peakFoamBlend: 0.42,
  },
  ocean: {
    preset: "ocean",
    quality: "auto",
    waterColor: "#1d6a7c",
    deepColor: "#04161f",
    opacity: 1,
    reflectionResolution: 512,
    waveScale: 0.65,
    waveHeight: 1.6,
    waveSpeed: 0.9,
    distortion: 14,
    chopStrength: 1.0,
    chopScale: 1.1,
    chopHeight: 0.55,
    windDirection: 35,
    rippleStrength: 0.55,
    roughness: 0.22,
    highlightSize: 0.45,
    wetness: 0.85,
    depthBlend: 0.78,
    sunStrength: 1.05,
    peakFoam: 0.18,
    peakFoamColor: "#eefcff",
    peakFoamBlend: 0.5,
  },
  storm: {
    preset: "storm",
    quality: "auto",
    waterColor: "#0c5969",
    deepColor: "#020b13",
    opacity: 1,
    reflectionResolution: 256,
    waveScale: 1.05,
    waveHeight: 3.2,
    waveSpeed: 1.35,
    distortion: 15,
    chopStrength: 1.0,
    chopScale: 1.4,
    chopHeight: 1.1,
    windDirection: 48,
    rippleStrength: 0.42,
    roughness: 0.48,
    highlightSize: 0.6,
    wetness: 1.0,
    depthBlend: 0.82,
    sunStrength: 0.8,
    peakFoam: 0.34,
    peakFoamColor: "#eefcff",
    peakFoamBlend: 0.58,
  },
};

export const defaultWaterSettings: WaterSettings = WATER_PRESETS.ocean;

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function resolvePreset(value: unknown): WaterPreset {
  return value === "calm" || value === "ocean" || value === "storm" ? value : defaultWaterSettings.preset;
}

function resolveQuality(value: unknown): WaterQuality {
  return value === "auto" || value === "low" || value === "medium" || value === "high"
    ? value
    : defaultWaterSettings.quality;
}

function resolveResolution(value: unknown): WaterReflectionResolution {
  return value === 256 || value === 512 || value === 1024 ? value : defaultWaterSettings.reflectionResolution;
}

function normalizeDegrees(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return ((value % 360) + 360) % 360;
}

export function resolveWaterSettings(settings: Partial<WaterSettings> | undefined): WaterSettings {
  const preset = resolvePreset(settings?.preset);
  const base = WATER_PRESETS[preset];
  return {
    ...base,
    ...settings,
    preset,
    quality: resolveQuality(settings?.quality),
    waterColor: typeof settings?.waterColor === "string" ? settings.waterColor : base.waterColor,
    deepColor: typeof settings?.deepColor === "string" ? settings.deepColor : base.deepColor,
    opacity: clamp(settings?.opacity, 0.2, 1, base.opacity),
    reflectionResolution: resolveResolution(settings?.reflectionResolution),
    waveScale: clamp(settings?.waveScale, 0.1, 2, base.waveScale),
    waveHeight: clamp(settings?.waveHeight, 0, 5, base.waveHeight),
    waveSpeed: clamp(settings?.waveSpeed, 0, 2, base.waveSpeed),
    distortion: clamp(settings?.distortion, 0, 18, base.distortion),
    chopStrength: clamp(settings?.chopStrength, 0, 1.5, base.chopStrength),
    chopScale: clamp(settings?.chopScale, 0.2, 3, base.chopScale),
    chopHeight: clamp(settings?.chopHeight, 0, 3, base.chopHeight),
    windDirection: normalizeDegrees(settings?.windDirection, base.windDirection),
    rippleStrength: clamp(settings?.rippleStrength, 0, 1, base.rippleStrength),
    roughness: clamp(settings?.roughness, 0, 1, base.roughness),
    highlightSize: clamp(settings?.highlightSize, 0, 1, base.highlightSize),
    wetness: clamp(settings?.wetness, 0, 1.5, base.wetness),
    depthBlend: clamp(settings?.depthBlend, 0, 1, base.depthBlend),
    sunStrength: clamp(settings?.sunStrength, 0, 2, base.sunStrength),
    peakFoam: clamp(settings?.peakFoam, 0, 1, base.peakFoam),
    peakFoamColor: typeof settings?.peakFoamColor === "string" ? settings.peakFoamColor : base.peakFoamColor,
    peakFoamBlend: clamp(settings?.peakFoamBlend, 0, 1, base.peakFoamBlend),
  };
}
