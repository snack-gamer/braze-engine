import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { defaultEnvironment } from "../../../../constants";
import type { SkyMaterialUniforms } from "../../../../three/sky/material-uniforms";
import {
  QuarterResolutionCloudNode,
  resolveCloudSunDirection,
} from "./quarter-resolution-cloud-node";

describe("quarter-resolution cloud node", () => {
  it("resizes once per changed quarter-linear output size", () => {
    const node = new QuarterResolutionCloudNode(
      new THREE.PerspectiveCamera(),
      new THREE.DirectionalLight(),
    );
    const size = new THREE.Vector2();

    expect(node.setSize(3840, 2160)).toBe(true);
    expect(node.getSize(size).toArray()).toEqual([960, 540]);
    expect(node.setSize(3840, 2160)).toBe(false);
    expect(node.setSize(1, 1)).toBe(true);
    expect(node.getSize(size).toArray()).toEqual([1, 1]);
    expect(() => node.setSize(0, 1080)).toThrow(/width/);
    node.dispose();
  });

  it("uses the hierarchy light direction while it is active", () => {
    const light = new THREE.DirectionalLight("#fff", 2);
    light.position.set(4, 8, -2);
    light.target.position.set(1, 2, 1);
    const fallback = new THREE.Vector3(0, 1, 0);
    const target = new THREE.Vector3();
    const expected = light.position.clone().sub(light.target.position).normalize();

    expect(resolveCloudSunDirection(light, fallback, target).distanceTo(expected)).toBeLessThan(1e-8);
  });

  it("uses the authored sky fallback when no hierarchy light contributes", () => {
    const light = new THREE.DirectionalLight("#fff", 0);
    light.position.set(4, 8, -2);
    const fallback = new THREE.Vector3(-0.3, 0.7, 0.4).normalize();
    const target = new THREE.Vector3();

    expect(resolveCloudSunDirection(light, fallback, target).distanceTo(fallback)).toBeLessThan(1e-8);
    light.intensity = 1;
    light.position.copy(light.target.position);
    expect(resolveCloudSunDirection(light, fallback, target).distanceTo(fallback)).toBeLessThan(1e-8);
  });

  it("applies every authored cloud control to the persistent live uniforms", () => {
    const node = new QuarterResolutionCloudNode(
      new THREE.PerspectiveCamera(),
      new THREE.DirectionalLight(),
    );
    const settings = {
      ...defaultEnvironment.sky,
      cloudsCoverage: 0.11,
      cloudsDensity: 0.12,
      cloudsDepth: 0.13,
      cloudsScale: 0.14,
      cloudsDetail: 0.15,
      cloudsComplexity: 0.16,
      cloudsContrast: 0.17,
      cloudsWarp: 0.18,
      cloudsBillow: 0.19,
      cloudsStreaks: 0.20,
      cloudsErosion: 0.21,
      cloudsWeather: 0.22,
      cloudsTopVariation: 0.23,
      cloudsAbsorption: 0.24,
      cloudsScattering: 0.25,
      cloudsSelfShadow: 0.26,
      cloudsShadowStrength: 0.27,
      cloudsShadowDetail: 0.28,
      cloudsSpeed: 0.29,
    };

    node.apply(settings);

    const uniforms = inspectUniforms(node);
    for (const [name, value] of Object.entries(settings)) {
      if (!name.startsWith("clouds")) continue;
      expect(uniforms[name as keyof SkyMaterialUniforms].value, name).toBe(value);
    }
    node.dispose();
  });
});

function inspectUniforms(node: QuarterResolutionCloudNode): SkyMaterialUniforms {
  return (node as unknown as { uniforms: SkyMaterialUniforms }).uniforms;
}
