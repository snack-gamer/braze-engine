import * as THREE from "three";
import { Mesh, NodeMaterial } from "three/webgpu";
import type { SkySettings } from "../../rendering/domain/environment-settings";
import type { Vec3 } from "../../scene/domain/scene-values";
import type { Runtime } from "../runtime";
import { waterShared } from "../water/shared";
import {
  calculateAtmosphericFog,
  calculateSkyAmbientLighting,
  setDefaultAtmosphereDirection,
} from "./lighting";
import { createSkyMaterial } from "./material";
import {
  applySkyMaterialSettings,
  createSkyMaterialUniforms,
} from "./material-uniforms";

// The shell remains inside the default far plane and follows the camera so it
// contributes no apparent translation or culling work.
const SKY_RADIUS = 120;

/** Owns the scene resources and authored-setting application for one sky. */
export class WebGpuSkyRuntime {
  private readonly geometry: THREE.SphereGeometry;
  private readonly material: NodeMaterial;
  private readonly mesh: Mesh;
  private readonly uniforms = createSkyMaterialUniforms();
  private readonly sunDirection = new THREE.Vector3();
  private readonly fog = new THREE.FogExp2("#aab0b8", 0);
  private sunDirectionOverride: THREE.Vector3 | null = null;
  private latestSettings: SkySettings | null = null;
  private settingsKey = "";

  constructor(private readonly runtime: Runtime) {
    this.geometry = new THREE.SphereGeometry(SKY_RADIUS, 64, 32);
    this.material = createSkyMaterial(this.uniforms);
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = "WebGPU Physical Sky";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100000;
    this.mesh.userData.skyEnvironment = true;
    this.runtime.scene.add(this.mesh);
    // Clear the previous world once when entering procedural Sky mode. The
    // refreshed reflection probe must survive later Sky setting changes.
    this.runtime.scene.background = null;
    this.runtime.scene.environment = null;
  }

  applySettings(settings: SkySettings): void {
    const key = JSON.stringify(settings);
    if (key === this.settingsKey) return;
    this.settingsKey = key;
    this.latestSettings = settings;
    this.applySunDirection();
    applySkyMaterialSettings(this.uniforms, settings, this.sunDirection);
    this.applyAmbientLighting(settings);
    this.applyAtmosphericFog(settings);
    this.mesh.visible = true;
    waterShared.environmentIntensity = settings.exposure;
  }

  /** Aligns the visible disc and cloud scattering with an authored key light. */
  setSunDirectionOverride(direction: Vec3 | null): void {
    this.sunDirectionOverride = direction
      ? new THREE.Vector3(direction[0], direction[1], direction[2]).normalize()
      : null;
    this.uniforms.sunVisibility.value = direction ? 1 : 0;
    if (!this.latestSettings) return;
    this.applySunDirection();
    this.applyAmbientLighting(this.latestSettings);
    this.applyAtmosphericFog(this.latestSettings);
  }

  update(): void {
    this.mesh.visible = true;
    this.mesh.position.copy(this.runtime.camera.position);
    this.mesh.scale.setScalar(Math.max(1, this.runtime.camera.far * 0.8) / SKY_RADIUS);
  }

  dispose(): void {
    this.runtime.scene.remove(this.mesh);
    if (this.runtime.scene.fog === this.fog) this.runtime.scene.fog = null;
    this.geometry.dispose();
    this.material.dispose();
  }

  private applySunDirection(): void {
    if (this.sunDirectionOverride) this.sunDirection.copy(this.sunDirectionOverride);
    else setDefaultAtmosphereDirection(this.sunDirection);
    this.uniforms.sunDirection.value.copy(this.sunDirection);
  }

  private applyAtmosphericFog(settings: SkySettings): void {
    const atmosphere = calculateAtmosphericFog(settings, this.sunDirection.y);
    this.uniforms.atmosphericFogColor.value.copy(atmosphere.color);
    this.uniforms.atmosphericFogDensity.value = atmosphere.density;
    if (atmosphere.density > 0) {
      this.fog.color.copy(atmosphere.color);
      this.fog.density = atmosphere.density;
      this.runtime.scene.fog = this.fog;
    } else if (this.runtime.scene.fog === this.fog) {
      this.runtime.scene.fog = null;
    }
  }

  private applyAmbientLighting(settings: SkySettings): void {
    const lighting = calculateSkyAmbientLighting(settings, this.sunDirection.y);
    const hemisphere = this.runtime.worldLights.hemisphere;
    hemisphere.color.copy(lighting.skyColor);
    hemisphere.groundColor.copy(lighting.groundColor);
    hemisphere.intensity = lighting.hemisphereIntensity;
    waterShared.environmentColor.copy(lighting.skyColor);
  }
}
