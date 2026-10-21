import * as THREE from "three";
import { uniform } from "../tsl";
import type { SkySettings } from "../../types";
import { sunAngularRadiusFrom } from "./lighting";

// Three's public TSL surface does not currently expose a stable common node
// type that covers every fluent expression used by this material.
export type SkyNode = any;

export type SkyMaterialUniforms = {
  sunDirection: SkyNode;
  sunVisibility: SkyNode;
  exposure: SkyNode;
  turbidity: SkyNode;
  scatteringIntensity: SkyNode;
  scatteringDistance: SkyNode;
  horizon: SkyNode;
  groundLight: SkyNode;
  sunAngularRadius: SkyNode;
  sunGlow: SkyNode;
  starsIntensity: SkyNode;
  starsSize: SkyNode;
  galaxyIntensity: SkyNode;
  cloudsCoverage: SkyNode;
  cloudsDensity: SkyNode;
  cloudsDepth: SkyNode;
  cloudsScale: SkyNode;
  cloudsDetail: SkyNode;
  cloudsComplexity: SkyNode;
  cloudsContrast: SkyNode;
  cloudsWarp: SkyNode;
  cloudsBillow: SkyNode;
  cloudsStreaks: SkyNode;
  cloudsErosion: SkyNode;
  cloudsWeather: SkyNode;
  cloudsTopVariation: SkyNode;
  cloudsAbsorption: SkyNode;
  cloudsScattering: SkyNode;
  cloudsSelfShadow: SkyNode;
  cloudsShadowStrength: SkyNode;
  cloudsShadowDetail: SkyNode;
  cloudsSpeed: SkyNode;
  atmosphericFogColor: SkyNode;
  atmosphericFogDensity: SkyNode;
  fogSkyCoverage: SkyNode;
  fogSkyHeight: SkyNode;
  fogSkySoftness: SkyNode;
};

export function createSkyMaterialUniforms(): SkyMaterialUniforms {
  return {
    sunDirection: uniform(new THREE.Vector3(0, 1, 0)),
    sunVisibility: uniform(0),
    exposure: uniform(1),
    turbidity: uniform(1),
    scatteringIntensity: uniform(0),
    scatteringDistance: uniform(30),
    horizon: uniform(0.5),
    groundLight: uniform(0.5),
    sunAngularRadius: uniform(THREE.MathUtils.degToRad(0.265)),
    sunGlow: uniform(0.25),
    starsIntensity: uniform(1),
    starsSize: uniform(1),
    galaxyIntensity: uniform(1),
    cloudsCoverage: uniform(0),
    cloudsDensity: uniform(0.5),
    cloudsDepth: uniform(0.65),
    cloudsScale: uniform(0.82),
    cloudsDetail: uniform(1.20),
    cloudsComplexity: uniform(0.62),
    cloudsContrast: uniform(1.35),
    cloudsWarp: uniform(0.44),
    cloudsBillow: uniform(0.62),
    cloudsStreaks: uniform(0.18),
    cloudsErosion: uniform(0.42),
    cloudsWeather: uniform(0.55),
    cloudsTopVariation: uniform(0.35),
    cloudsAbsorption: uniform(0.74),
    cloudsScattering: uniform(0.18),
    cloudsSelfShadow: uniform(1.14),
    cloudsShadowStrength: uniform(1.35),
    cloudsShadowDetail: uniform(1.25),
    cloudsSpeed: uniform(0.3),
    atmosphericFogColor: uniform(new THREE.Color("#000000")),
    atmosphericFogDensity: uniform(0),
    fogSkyCoverage: uniform(1.35),
    fogSkyHeight: uniform(0.72),
    fogSkySoftness: uniform(0.55),
  };
}

export function applySkyMaterialSettings(
  uniforms: SkyMaterialUniforms,
  settings: SkySettings,
  sunDirection: THREE.Vector3,
): void {
  uniforms.sunDirection.value.copy(sunDirection);
  uniforms.exposure.value = settings.exposure;
  uniforms.turbidity.value = settings.turbidity;
  uniforms.scatteringIntensity.value = settings.scatteringIntensity;
  uniforms.scatteringDistance.value = settings.scatteringDistance;
  uniforms.horizon.value = settings.horizonBlend;
  uniforms.groundLight.value = settings.groundLight;
  uniforms.sunAngularRadius.value = sunAngularRadiusFrom(settings.sunSize);
  uniforms.sunGlow.value = settings.sunGlow;
  uniforms.starsIntensity.value = settings.starsIntensity;
  uniforms.starsSize.value = settings.starsSize;
  uniforms.galaxyIntensity.value = settings.galaxyIntensity;
  uniforms.cloudsCoverage.value = settings.cloudsCoverage;
  uniforms.cloudsDensity.value = settings.cloudsDensity;
  uniforms.cloudsDepth.value = settings.cloudsDepth;
  uniforms.cloudsScale.value = settings.cloudsScale;
  uniforms.cloudsDetail.value = settings.cloudsDetail;
  uniforms.cloudsComplexity.value = settings.cloudsComplexity;
  uniforms.cloudsContrast.value = settings.cloudsContrast;
  uniforms.cloudsWarp.value = settings.cloudsWarp;
  uniforms.cloudsBillow.value = settings.cloudsBillow;
  uniforms.cloudsStreaks.value = settings.cloudsStreaks;
  uniforms.cloudsErosion.value = settings.cloudsErosion;
  uniforms.cloudsWeather.value = settings.cloudsWeather;
  uniforms.cloudsTopVariation.value = settings.cloudsTopVariation;
  uniforms.cloudsAbsorption.value = settings.cloudsAbsorption;
  uniforms.cloudsScattering.value = settings.cloudsScattering;
  uniforms.cloudsSelfShadow.value = settings.cloudsSelfShadow;
  uniforms.cloudsShadowStrength.value = settings.cloudsShadowStrength;
  uniforms.cloudsShadowDetail.value = settings.cloudsShadowDetail;
  uniforms.cloudsSpeed.value = settings.cloudsSpeed;
  uniforms.fogSkyCoverage.value = settings.fogSkyCoverage;
  uniforms.fogSkyHeight.value = settings.fogSkyHeight;
  uniforms.fogSkySoftness.value = settings.fogSkySoftness;
}
