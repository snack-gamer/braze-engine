import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { defaultEnvironment } from "../../constants";
import type { Runtime } from "../runtime";
import { waterShared } from "../water/shared";
import { WebGpuSkyRuntime } from "./runtime";

const originalWaterEnvironmentIntensity = waterShared.environmentIntensity;
const originalWaterEnvironmentColor = waterShared.environmentColor.clone();

afterEach(() => {
  waterShared.environmentIntensity = originalWaterEnvironmentIntensity;
  waterShared.environmentColor.copy(originalWaterEnvironmentColor);
});

function runtimeFixture() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 150);
  const hemisphere = new THREE.HemisphereLight("#123456", "#654321", 0.25);
  const key = new THREE.DirectionalLight("#ff00ff", 7);
  key.castShadow = true;
  const keyOffset = new THREE.Vector3(3, 4, 5);
  return {
    scene,
    camera,
    worldLights: { hemisphere, key, keyOffset },
  } as unknown as Runtime;
}

function inspectSun(runtime: WebGpuSkyRuntime) {
  return runtime as unknown as {
    uniforms: {
      sunDirection: { value: THREE.Vector3 };
      sunVisibility: { value: number };
    };
  };
}

describe("procedural sky runtime", () => {
  it("updates ambient light without overwriting the hierarchy key", () => {
    const runtime = runtimeFixture();
    const sky = new WebGpuSkyRuntime(runtime);
    const initialKeyOffset = runtime.worldLights.keyOffset.clone();

    sky.applySettings(defaultEnvironment.sky);

    expect(runtime.worldLights.key.color.getHexString()).toBe("ff00ff");
    expect(runtime.worldLights.key.intensity).toBe(7);
    expect(runtime.worldLights.key.castShadow).toBe(true);
    expect(runtime.worldLights.keyOffset.distanceTo(initialKeyOffset)).toBe(0);
    expect(runtime.worldLights.hemisphere.intensity).toBeGreaterThan(0);
    sky.dispose();
  });

  it("clears the previous environment once but preserves the refreshed probe during edits", () => {
    const runtime = runtimeFixture();
    runtime.scene.environment = new THREE.CubeTexture();
    const sky = new WebGpuSkyRuntime(runtime);
    expect(runtime.scene.environment).toBeNull();

    const refreshedProbe = new THREE.CubeTexture();
    runtime.scene.environment = refreshedProbe;
    sky.applySettings(defaultEnvironment.sky);
    sky.applySettings({ ...defaultEnvironment.sky, exposure: 1.25 });

    expect(runtime.scene.environment).toBe(refreshedProbe);
    sky.dispose();
    refreshedProbe.dispose();
  });

  it("shows the sun only while a hierarchy Directional Light supplies its direction", () => {
    const runtime = runtimeFixture();
    const sky = new WebGpuSkyRuntime(runtime);
    sky.applySettings(defaultEnvironment.sky);
    expect(inspectSun(sky).uniforms.sunVisibility.value).toBe(0);

    sky.setSunDirectionOverride([0, 2, 0]);
    expect(inspectSun(sky).uniforms.sunVisibility.value).toBe(1);
    expect(inspectSun(sky).uniforms.sunDirection.value.toArray()).toEqual([0, 1, 0]);

    sky.setSunDirectionOverride(null);
    expect(inspectSun(sky).uniforms.sunVisibility.value).toBe(0);
    sky.dispose();
  });
});
