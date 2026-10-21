export type WaterPreset = "calm" | "ocean" | "storm";

export type WaterReflectionResolution = 256 | 512 | 1024;

export type WaterQuality = "auto" | "low" | "medium" | "high";

export type WaterSettings = {
  preset: WaterPreset;
  quality: WaterQuality;
  waterColor: string;
  deepColor: string;
  opacity: number;
  reflectionResolution: WaterReflectionResolution;
  waveScale: number;
  waveHeight: number;
  waveSpeed: number;
  distortion: number;
  chopStrength: number;
  chopScale: number;
  chopHeight: number;
  windDirection: number;
  rippleStrength: number;
  roughness: number;
  highlightSize: number;
  wetness: number;
  depthBlend: number;
  sunStrength: number;
  peakFoam: number;
  peakFoamColor: string;
  peakFoamBlend: number;
};
