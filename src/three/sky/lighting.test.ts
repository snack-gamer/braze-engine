import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { defaultEnvironment } from "../../constants";
import type { SkySettings } from "../../rendering/domain/environment-settings";
import {
  calculateAtmosphericFog,
  calculateSkyAmbientLighting,
  daylightFactor,
  nightFactor,
  setDefaultAtmosphereDirection,
  sunAngularRadiusFrom,
  twilightFactor,
} from "./lighting";

function settings(patch: Partial<SkySettings> = {}): SkySettings {
  return { ...defaultEnvironment.sky, ...patch };
}

describe("sky CPU lighting calculations", () => {
  it("uses one normalized atmosphere orientation when no hierarchy light is active", () => {
    const direction = setDefaultAtmosphereDirection(new THREE.Vector3());
    expect(direction.length()).toBeCloseTo(1, 12);
    expect(direction.toArray()).toEqual(new THREE.Vector3(0.45, 0.75, 0.5).normalize().toArray());
  });

  it("retains the non-linear sun radius mapping and endpoint clamps", () => {
    expect(sunAngularRadiusFrom(-1)).toBeCloseTo(0.1 * Math.PI / 180, 12);
    expect(sunAngularRadiusFrom(0.5)).toBeCloseTo(0.475 * Math.PI / 180, 12);
    expect(sunAngularRadiusFrom(3)).toBeCloseTo(2.5 * Math.PI / 180, 12);
  });

  it("cross-fades day, twilight, and night without exceeding normalized factors", () => {
    for (const sunY of [-1, -0.18, -0.05, 0, 0.08, 0.22, 1]) {
      expect(daylightFactor(sunY)).toBeGreaterThanOrEqual(0);
      expect(daylightFactor(sunY)).toBeLessThanOrEqual(1);
      expect(twilightFactor(sunY)).toBeGreaterThanOrEqual(0);
      expect(twilightFactor(sunY)).toBeLessThanOrEqual(1);
      expect(nightFactor(sunY)).toBeGreaterThanOrEqual(0);
      expect(nightFactor(sunY)).toBeLessThanOrEqual(1);
    }
    expect(daylightFactor(1)).toBe(1);
    expect(nightFactor(-1)).toBe(1);
    expect(twilightFactor(-1)).toBe(0);
    expect(twilightFactor(1)).toBe(0);
  });

  it("derives deterministic daylight and night ambient intensities", () => {
    const authored = settings({ exposure: 2, groundLight: 0.5 });
    const day = calculateSkyAmbientLighting(authored, 1);
    expect(day.hemisphereIntensity).toBeCloseTo(0.84, 12);
    const night = calculateSkyAmbientLighting(authored, -1);
    expect(night.hemisphereIntensity).toBeCloseTo(0.05, 12);
  });

  it("combines explicit and scattering fog density and clamps the atmosphere", () => {
    const atmosphere = calculateAtmosphericFog(settings({
      fogDensity: 0.02,
      scatteringIntensity: 1,
      scatteringDistance: 20,
      fogColor: "#ff0000",
      fogTintInfluence: 1,
    }), 0.4);
    expect(atmosphere.density).toBeCloseTo(0.07, 12);
    expect(atmosphere.color.r).toBeGreaterThan(atmosphere.color.g);
    expect(calculateAtmosphericFog(settings({
      fogDensity: 0.2,
      scatteringIntensity: 2,
      scatteringDistance: 1,
    }), 0).density).toBe(0.35);
    expect(calculateAtmosphericFog(settings({
      fogDensity: 0,
      scatteringIntensity: 0,
    }), 0).density).toBe(0);
  });
});
