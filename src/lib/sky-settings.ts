import { defaultEnvironment } from "../constants";
import type { SkySettings } from "../rendering/domain/environment-settings";

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeSkySettings(raw: unknown): SkySettings {
  const fallback = defaultEnvironment.sky;
  const source = raw && typeof raw === "object"
    ? raw as Partial<SkySettings> & { cloudsShape?: unknown }
    : {};
  const legacyShape = source.cloudsShape;
  const legacyNoise = legacyShape === "cirrus"
    ? { billow: 0.16, streaks: 0.86, erosion: 0.66, depth: 0.28, contrast: 0.52 }
    : legacyShape === "stratus"
      ? { billow: 0.20, streaks: 0.38, erosion: 0.28, depth: 0.34, contrast: 0.42 }
      : { billow: fallback.cloudsBillow, streaks: fallback.cloudsStreaks, erosion: fallback.cloudsErosion, depth: fallback.cloudsDepth, contrast: fallback.cloudsContrast };
  return {
    exposure: clamp(finiteNumber(source.exposure, fallback.exposure), 0, 4),
    sunSize: clamp(finiteNumber(source.sunSize, fallback.sunSize), 0, 2),
    sunGlow: clamp(finiteNumber(source.sunGlow, fallback.sunGlow), 0, 2),
    turbidity: clamp(finiteNumber(source.turbidity, fallback.turbidity), 0, 5),
    horizonBlend: clamp(finiteNumber(source.horizonBlend, fallback.horizonBlend), 0, 1),
    groundLight: clamp(finiteNumber(source.groundLight, fallback.groundLight), 0, 1),
    starsIntensity: clamp(finiteNumber(source.starsIntensity, fallback.starsIntensity), 0, 3),
    starsSize: clamp(finiteNumber(source.starsSize, fallback.starsSize), 0, 2),
    galaxyIntensity: clamp(finiteNumber(source.galaxyIntensity, fallback.galaxyIntensity), 0, 3),
    cloudsCoverage: clamp(finiteNumber(source.cloudsCoverage, fallback.cloudsCoverage), 0, 1),
    cloudsDensity: clamp(finiteNumber(source.cloudsDensity, fallback.cloudsDensity), 0, 1),
    cloudsDepth: clamp(finiteNumber(source.cloudsDepth, legacyNoise.depth), 0, 1),
    cloudsScale: clamp(finiteNumber(source.cloudsScale, fallback.cloudsScale), 0.08, 8),
    cloudsDetail: clamp(finiteNumber(source.cloudsDetail, fallback.cloudsDetail), 0, 2),
    cloudsComplexity: clamp(finiteNumber(source.cloudsComplexity, fallback.cloudsComplexity), 0, 1),
    cloudsContrast: clamp(finiteNumber(source.cloudsContrast, legacyNoise.contrast), 0, 2),
    cloudsWarp: clamp(finiteNumber(source.cloudsWarp, fallback.cloudsWarp), 0, 1),
    cloudsBillow: clamp(finiteNumber(source.cloudsBillow, legacyNoise.billow), 0, 1),
    cloudsStreaks: clamp(finiteNumber(source.cloudsStreaks, legacyNoise.streaks), 0, 1),
    cloudsErosion: clamp(finiteNumber(source.cloudsErosion, legacyNoise.erosion), 0, 1),
    cloudsWeather: clamp(finiteNumber(source.cloudsWeather, fallback.cloudsWeather), 0, 1),
    cloudsTopVariation: clamp(finiteNumber(source.cloudsTopVariation, fallback.cloudsTopVariation), 0, 1),
    cloudsAbsorption: clamp(finiteNumber(source.cloudsAbsorption, fallback.cloudsAbsorption), 0, 2),
    cloudsScattering: clamp(finiteNumber(source.cloudsScattering, fallback.cloudsScattering), 0, 2),
    cloudsSelfShadow: clamp(finiteNumber(source.cloudsSelfShadow, fallback.cloudsSelfShadow), 0, 2),
    cloudsShadowStrength: clamp(finiteNumber(source.cloudsShadowStrength, fallback.cloudsShadowStrength), 0, 2),
    cloudsShadowDetail: clamp(finiteNumber(source.cloudsShadowDetail, fallback.cloudsShadowDetail), 0, 2),
    cloudsSpeed: clamp(finiteNumber(source.cloudsSpeed, fallback.cloudsSpeed), 0, 1),
    scatteringIntensity: clamp(finiteNumber(source.scatteringIntensity, fallback.scatteringIntensity), 0, 2),
    scatteringDistance: clamp(finiteNumber(source.scatteringDistance, fallback.scatteringDistance), 1, 200),
    godraysIntensity: clamp(finiteNumber(source.godraysIntensity, fallback.godraysIntensity), 0, 3),
    godraysSpread: clamp(finiteNumber(source.godraysSpread, fallback.godraysSpread), 0.05, 1),
    godraysDecay: clamp(finiteNumber(source.godraysDecay, fallback.godraysDecay), 0, 1),
    fogColor: typeof source.fogColor === "string" ? source.fogColor : fallback.fogColor,
    fogDensity: clamp(finiteNumber(source.fogDensity, fallback.fogDensity), 0, 0.2),
    fogSkyCoverage: clamp(finiteNumber(source.fogSkyCoverage, fallback.fogSkyCoverage), 0, 2),
    fogSkyHeight: clamp(finiteNumber(source.fogSkyHeight, fallback.fogSkyHeight), 0, 1),
    fogSkySoftness: clamp(finiteNumber(source.fogSkySoftness, fallback.fogSkySoftness), 0, 1),
    fogTintInfluence: clamp(finiteNumber(source.fogTintInfluence, fallback.fogTintInfluence), 0, 1),
  };
}
