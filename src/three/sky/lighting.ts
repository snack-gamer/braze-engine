import * as THREE from "three";
import type { SkySettings } from "../../rendering/domain/environment-settings";

export type SkyAmbientLighting = {
  hemisphereIntensity: number;
  skyColor: THREE.Color;
  groundColor: THREE.Color;
};

export type AtmosphericFog = {
  color: THREE.Color;
  density: number;
};

/** Stable atmosphere orientation used only when no hierarchy light is active. */
export function setDefaultAtmosphereDirection(target: THREE.Vector3): THREE.Vector3 {
  return target.set(0.45, 0.75, 0.5).normalize();
}

// Map the 0..2 sun-size slider to a non-linear 0.1°..2.5° angular radius.
export function sunAngularRadiusFrom(size: number): number {
  const t = THREE.MathUtils.clamp(size / 2, 0, 1);
  const eased = t * t * (3 - 2 * t);
  return THREE.MathUtils.degToRad(THREE.MathUtils.lerp(0.1, 2.5, eased));
}

export function daylightFactor(sunY: number): number {
  return smoothstepNumber(-0.015, 0.22, sunY);
}

export function twilightFactor(sunY: number): number {
  return (1 - smoothstepNumber(0.05, 0.32, sunY)) * smoothstepNumber(-0.2, 0.08, sunY);
}

export function nightFactor(sunY: number): number {
  return 1 - smoothstepNumber(-0.18, 0.035, sunY);
}

export function calculateSkyAmbientLighting(
  settings: SkySettings,
  sunY: number,
): SkyAmbientLighting {
  const daylight = daylightFactor(sunY);
  const twilight = twilightFactor(sunY);
  const night = nightFactor(sunY);
  const hemisphereIntensity = settings.exposure * (
    daylight * THREE.MathUtils.lerp(0.16, 0.68, settings.groundLight)
    + twilight * 0.18
    + night * 0.025
  );
  const skyColor = new THREE.Color("#071126").lerp(new THREE.Color("#77a9d8"), daylight);
  skyColor.lerp(new THREE.Color("#d88555"), twilight * 0.45);
  skyColor.multiplyScalar(settings.exposure * THREE.MathUtils.lerp(0.22, 1, 1 - night));
  const groundColor = new THREE.Color("#10120f").lerp(
    new THREE.Color("#687061"),
    settings.groundLight,
  );
  return {
    hemisphereIntensity,
    skyColor,
    groundColor,
  };
}

export function calculateAtmosphericFog(
  settings: SkySettings,
  sunY: number,
): AtmosphericFog {
  const horizonColor = horizonFogColor(settings, sunY);
  const scatteringDensity = settings.scatteringIntensity > 0
    ? settings.scatteringIntensity / Math.max(1, settings.scatteringDistance)
    : 0;
  const density = THREE.MathUtils.clamp(settings.fogDensity + scatteringDensity, 0, 0.35);
  if (density <= 0) return { color: horizonColor, density: 0 };
  const tintWeight = settings.fogTintInfluence * THREE.MathUtils.lerp(
    0.35,
    1.0,
    THREE.MathUtils.clamp(settings.fogDensity / 0.08, 0, 1),
  );
  return {
    color: horizonColor.lerp(new THREE.Color(settings.fogColor), tintWeight),
    density,
  };
}

function horizonFogColor(settings: SkySettings, sunY: number): THREE.Color {
  const daylight = daylightFactor(sunY);
  const twilight = twilightFactor(sunY);
  const night = nightFactor(sunY);
  const turbidity = THREE.MathUtils.clamp(settings.turbidity / 5, 0, 1);
  const lowSun = 1 - smoothstepNumber(0.10, 0.55, sunY);
  const horizonLift = THREE.MathUtils.lerp(0.58, 0.92, settings.horizonBlend);

  const base = new THREE.Color("#606b98").lerp(new THREE.Color("#9ba8c5"), daylight);
  base.lerp(new THREE.Color("#8d80ad"), lowSun * THREE.MathUtils.lerp(0.22, 0.46, turbidity));
  base.lerp(new THREE.Color("#c08a78"), twilight * THREE.MathUtils.lerp(0.38, 0.76, turbidity));
  base.lerp(new THREE.Color("#11192e"), night);
  const sunWarmth = new THREE.Color("#d7b9a5").lerp(new THREE.Color("#e49a65"), twilight);
  base.lerp(sunWarmth, daylight * turbidity * lowSun * 0.10);
  base.multiplyScalar(settings.exposure * THREE.MathUtils.lerp(0.42, 0.74, daylight) * horizonLift);
  return base;
}

function smoothstepNumber(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
