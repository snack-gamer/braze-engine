import { DEFAULT_SKY_SETTINGS } from "./sky-presets";
import type { EnvironmentSettings } from "../domain/environment-settings";

/** Cloud-only reset values share the new-scene sky preset. */
type SkySettings = EnvironmentSettings["sky"];

export const DEFAULT_CLOUD_SETTINGS: Pick<
  SkySettings,
  | "cloudsCoverage" | "cloudsDensity" | "cloudsDepth" | "cloudsScale"
  | "cloudsDetail" | "cloudsComplexity" | "cloudsContrast" | "cloudsWarp"
  | "cloudsBillow" | "cloudsStreaks" | "cloudsErosion" | "cloudsWeather"
  | "cloudsTopVariation" | "cloudsAbsorption" | "cloudsScattering"
  | "cloudsSelfShadow" | "cloudsShadowStrength" | "cloudsShadowDetail" | "cloudsSpeed"
> = {
  cloudsCoverage: DEFAULT_SKY_SETTINGS.cloudsCoverage,
  cloudsDensity: DEFAULT_SKY_SETTINGS.cloudsDensity,
  cloudsDepth: DEFAULT_SKY_SETTINGS.cloudsDepth,
  cloudsScale: DEFAULT_SKY_SETTINGS.cloudsScale,
  cloudsDetail: DEFAULT_SKY_SETTINGS.cloudsDetail,
  cloudsComplexity: DEFAULT_SKY_SETTINGS.cloudsComplexity,
  cloudsContrast: DEFAULT_SKY_SETTINGS.cloudsContrast,
  cloudsWarp: DEFAULT_SKY_SETTINGS.cloudsWarp,
  cloudsBillow: DEFAULT_SKY_SETTINGS.cloudsBillow,
  cloudsStreaks: DEFAULT_SKY_SETTINGS.cloudsStreaks,
  cloudsErosion: DEFAULT_SKY_SETTINGS.cloudsErosion,
  cloudsWeather: DEFAULT_SKY_SETTINGS.cloudsWeather,
  cloudsTopVariation: DEFAULT_SKY_SETTINGS.cloudsTopVariation,
  cloudsAbsorption: DEFAULT_SKY_SETTINGS.cloudsAbsorption,
  cloudsScattering: DEFAULT_SKY_SETTINGS.cloudsScattering,
  cloudsSelfShadow: DEFAULT_SKY_SETTINGS.cloudsSelfShadow,
  cloudsShadowStrength: DEFAULT_SKY_SETTINGS.cloudsShadowStrength,
  cloudsShadowDetail: DEFAULT_SKY_SETTINGS.cloudsShadowDetail,
  cloudsSpeed: DEFAULT_SKY_SETTINGS.cloudsSpeed,
};
