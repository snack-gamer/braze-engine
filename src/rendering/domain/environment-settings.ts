import type {
  AmbientOcclusionSettings,
  ScreenSpaceReflectionSettings,
} from "./gi-settings";

export type ToneMapping = "aces" | "filmic" | "reinhard" | "linear" | "neutral";
export type WorldSource = "hdri" | "sky";

export type SkySettings = {
  exposure: number;
  sunSize: number;
  sunGlow: number;
  turbidity: number;
  horizonBlend: number;
  groundLight: number;
  // Night sky, visible as the sun drops below the horizon.
  starsIntensity: number;
  starsSize: number;
  galaxyIntensity: number;
  // Pseudo-volume clouds composited over the sky dome.
  cloudsCoverage: number;
  cloudsDensity: number;
  cloudsDepth: number;
  cloudsScale: number;
  cloudsDetail: number;
  cloudsComplexity: number;
  cloudsContrast: number;
  cloudsWarp: number;
  cloudsBillow: number;
  cloudsStreaks: number;
  cloudsErosion: number;
  cloudsWeather: number;
  cloudsTopVariation: number;
  cloudsAbsorption: number;
  cloudsScattering: number;
  cloudsSelfShadow: number;
  cloudsShadowStrength: number;
  cloudsShadowDetail: number;
  cloudsSpeed: number;
  // Aerial perspective using the sky's own color.
  scatteringIntensity: number;
  scatteringDistance: number;
  // Volumetric-style rays around the sun direction.
  godraysIntensity: number;
  godraysSpread: number;
  godraysDecay: number;
  // Explicit authored fog; when active it overrides scattering.
  fogColor: string;
  fogDensity: number;
  fogSkyCoverage: number;
  fogSkyHeight: number;
  fogSkySoftness: number;
  fogTintInfluence: number;
};

export type EnvironmentSettings = {
  hdriUrl: string | null;
  hdriName: string | null;
  intensity: number;
  rotationDeg: number;
  exposureEv: number;
  toneMapping: ToneMapping;
  worldSource: WorldSource;
  hueShiftDeg: number;
  saturation: number;
  brightness: number;
  contrast: number;
  bloom: boolean;
  bloomIntensity: number;
  bloomThreshold: number;
  bloomSmoothing: number;
  bloomRadius: number;
  sky: SkySettings;
  ao: AmbientOcclusionSettings;
  ssr: ScreenSpaceReflectionSettings;
};
