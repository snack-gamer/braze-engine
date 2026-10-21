import {
  type CameraSettings,
  type CameraState,
  type DepthOfFieldComponent,
  type EnvironmentSettings,
  type SceneObject,
} from "./types";
import { directionalLightFromEnvironment } from "./lib/directional-light";

export const SCENE_WIDTH = 1280;
export const SCENE_HEIGHT = 720;
export const SCENE_FPS = 12;
export const SCENE_DURATION = 6;

export const defaultCamera: CameraState = {
  position: [5.6, 4.2, 6.4],
  target: [0, 0.5, 0],
  fov: 52,
};

export const defaultCameraSettings: CameraSettings = {
  target: [0, 0.5, 0],
  fov: 52,
  near: 0.1,
  far: 200,
};

export const defaultDepthOfFieldComponent: DepthOfFieldComponent = {
  enabled: true,
  mode: "manual",
  focusDistance: 5,
  fStop: 2.8,
  autoFocusWidth: 1,
  autoBlurStrength: 1,
};

export const seedCameraId = "obj-camera-main";

export const seedObjects: SceneObject[] = [
  {
    id: seedCameraId,
    name: "Camera 1",
    primitive: "camera",
    color: "#a4b6c7",
    visible: true,
    locked: false,
    position: [5.6, 4.2, 6.4],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    camera: defaultCameraSettings,
  },
  directionalLightFromEnvironment(undefined),

];

// World / environment defaults.
export const defaultEnvironment: EnvironmentSettings = {
  hdriUrl: null,
  hdriName: null,
  intensity: 1.0,
  rotationDeg: 0,
  exposureEv: 0,
  toneMapping: "aces",
  worldSource: "hdri",
  hueShiftDeg: 0,
  saturation: 0,
  brightness: 0,
  contrast: 0,
  bloom: false,
  bloomIntensity: 0.6,
  bloomThreshold: 0.85,
  bloomSmoothing: 0.2,
  bloomRadius: 0.5,
  sky: {
    exposure: 0.92,
    sunSize: 0.42,
    sunGlow: 0.22,
    turbidity: 1.15,
    horizonBlend: 0.5,
    groundLight: 0.48,
    starsIntensity: 1.0,
    starsSize: 1.0,
    galaxyIntensity: 1.0,
    cloudsCoverage: 0.46,
    cloudsDensity: 0.70,
    cloudsDepth: 0.76,
    cloudsScale: 0.82,
    cloudsDetail: 1.20,
    cloudsComplexity: 0.86,
    cloudsContrast: 1.35,
    cloudsWarp: 0.44,
    cloudsBillow: 0.82,
    cloudsStreaks: 0.08,
    cloudsErosion: 0.52,
    cloudsWeather: 0.68,
    cloudsTopVariation: 0.72,
    cloudsAbsorption: 0.74,
    cloudsScattering: 0.18,
    cloudsSelfShadow: 1.14,
    cloudsShadowStrength: 1.35,
    cloudsShadowDetail: 1.25,
    cloudsSpeed: 0.25,
    scatteringIntensity: 0.0,
    scatteringDistance: 30,
    godraysIntensity: 0.0,
    godraysSpread: 0.45,
    godraysDecay: 0.6,
    fogColor: "#aab0b8",
    fogDensity: 0.0,
    fogSkyCoverage: 1.35,
    fogSkyHeight: 0.72,
    fogSkySoftness: 0.55,
    fogTintInfluence: 0.08,
  },
  ao: {
    enabled: true,
    intensity: 0.6,
    radius: 0.25,
    samples: 16,
    thickness: 1,
    distanceFalloff: 1,
  },
  ssr: {
    enabled: false,
    maxDistance: 1.0,
    thickness: 0.1,
    opacity: 1.0,
    quality: 0.5,
    blurQuality: 2,
  },
};
