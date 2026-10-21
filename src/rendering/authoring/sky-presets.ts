import type { SkySettings } from "../domain/environment-settings";
import type { DirectionalLightSettings } from "../../scene/domain/directional-light";
import type { Vec3 } from "../../scene/domain/scene-values";

/** Authored default captured from Main Scene. Saved documents keep their own values. */
export const DEFAULT_SKY_SETTINGS: Readonly<SkySettings> = {
  exposure: 0.58,
  sunSize: 0.58,
  sunGlow: 0.4,
  turbidity: 0.7,
  horizonBlend: 0.78,
  groundLight: 1,
  starsIntensity: 1,
  starsSize: 1,
  galaxyIntensity: 1,
  cloudsCoverage: 0.39,
  cloudsDensity: 1,
  cloudsDepth: 0.81,
  cloudsScale: 0.66,
  cloudsDetail: 0.81,
  cloudsComplexity: 0.41,
  cloudsContrast: 0,
  cloudsWarp: 1,
  cloudsBillow: 0.32,
  cloudsStreaks: 0.85,
  cloudsErosion: 0.37,
  cloudsWeather: 0.47,
  cloudsTopVariation: 0.25,
  cloudsAbsorption: 0,
  cloudsScattering: 0,
  cloudsSelfShadow: 0.89,
  cloudsShadowStrength: 1.42,
  cloudsShadowDetail: 2,
  cloudsSpeed: 0.04,
  scatteringIntensity: 0.57,
  scatteringDistance: 54,
  godraysIntensity: 3,
  godraysSpread: 1,
  godraysDecay: 1,
  fogColor: "#aab0b8",
  fogDensity: 0,
  fogSkyCoverage: 0.84,
  fogSkyHeight: 0.3,
  fogSkySoftness: 0.53,
  fogTintInfluence: 0,
};

/** The sky follows the scene's directional light, so the preset includes its sun. */
export const DEFAULT_SKY_SUN: {
  readonly rotation: Readonly<Vec3>;
  readonly light: Readonly<DirectionalLightSettings>;
} = {
  rotation: [138.4867, -34.1723, 107.5395],
  light: { enabled: true, color: "#ffffff", intensity: 2.6, castShadows: true },
};
