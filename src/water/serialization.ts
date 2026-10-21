import { resolveWaterSettings } from "./settings";
import type { WaterSettings } from "./types";

export function serializeWaterSettings(water: WaterSettings | undefined) {
  if (!water) return null;
  return {
    preset: water.preset,
    quality: water.quality,
    water_color: water.waterColor,
    deep_color: water.deepColor,
    opacity: water.opacity,
    reflection_resolution: water.reflectionResolution,
    wave_scale: water.waveScale,
    wave_height: water.waveHeight,
    wave_speed: water.waveSpeed,
    distortion: water.distortion,
    chop_strength: water.chopStrength,
    chop_scale: water.chopScale,
    chop_height: water.chopHeight,
    wind_direction: water.windDirection,
    ripple_strength: water.rippleStrength,
    roughness: water.roughness,
    highlight_size: water.highlightSize,
    wetness: water.wetness,
    depth_blend: water.depthBlend,
    sun_strength: water.sunStrength,
    peak_foam: water.peakFoam,
    peak_foam_color: water.peakFoamColor,
    peak_foam_blend: water.peakFoamBlend,
  };
}

export function parseWaterSettings(raw: any): WaterSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return resolveWaterSettings({
    preset: raw.preset,
    quality: raw.quality,
    waterColor: typeof raw.water_color === "string" ? raw.water_color : raw.waterColor,
    deepColor: typeof raw.deep_color === "string" ? raw.deep_color : raw.deepColor,
    opacity: typeof raw.opacity === "number" ? raw.opacity : undefined,
    reflectionResolution: raw.reflection_resolution ?? raw.reflectionResolution,
    waveScale: typeof raw.wave_scale === "number" ? raw.wave_scale : raw.waveScale,
    waveHeight: typeof raw.wave_height === "number" ? raw.wave_height : raw.waveHeight,
    waveSpeed: typeof raw.wave_speed === "number" ? raw.wave_speed : raw.waveSpeed,
    distortion: typeof raw.distortion === "number" ? raw.distortion : undefined,
    chopStrength: typeof raw.chop_strength === "number" ? raw.chop_strength : raw.chopStrength,
    chopScale: typeof raw.chop_scale === "number" ? raw.chop_scale : raw.chopScale,
    chopHeight: typeof raw.chop_height === "number" ? raw.chop_height : raw.chopHeight,
    windDirection: typeof raw.wind_direction === "number" ? raw.wind_direction : raw.windDirection,
    rippleStrength: typeof raw.ripple_strength === "number" ? raw.ripple_strength : raw.rippleStrength,
    roughness: typeof raw.roughness === "number" ? raw.roughness : undefined,
    highlightSize: typeof raw.highlight_size === "number" ? raw.highlight_size : raw.highlightSize,
    wetness: typeof raw.wetness === "number" ? raw.wetness : undefined,
    depthBlend: typeof raw.depth_blend === "number" ? raw.depth_blend : raw.depthBlend,
    sunStrength: typeof raw.sun_strength === "number" ? raw.sun_strength : raw.sunStrength,
    peakFoam: typeof raw.peak_foam === "number" ? raw.peak_foam : raw.peakFoam,
    peakFoamColor: typeof raw.peak_foam_color === "string" ? raw.peak_foam_color : raw.peakFoamColor,
    peakFoamBlend: typeof raw.peak_foam_blend === "number" ? raw.peak_foam_blend : raw.peakFoamBlend,
  });
}
