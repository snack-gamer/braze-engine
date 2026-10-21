import * as THREE from "three";
import type { SceneObject } from "../../types";
import { resolveWaterSettings } from "../../water/settings";
import type { WaterQuality, WaterReflectionResolution, WaterSettings } from "../../water/types";

const OCEAN_SIZE = 24;
const WATER_BODY_VERSION = "webgpu-physical-v1";

// Caps keyed on the user "Mesh budget" knob. Numbers picked so the densest
// case stays well under 50k tris on a single plane - cheap on every GPU.
const DETAIL_CAPS: Record<WaterReflectionResolution, number> = {
  256: 56,
  512: 96,
  1024: 156,
};

const QUALITY_SEGMENTS: Record<Exclude<WaterQuality, "auto">, number> = {
  low: 52,
  medium: 86,
  high: 132,
};

function oceanSizeFor(object: SceneObject): number {
  const scaleX = Math.abs(object.scale[0] || 1);
  const scaleZ = Math.abs(object.scale[2] || 1);
  return Math.max(scaleX, scaleZ) * OCEAN_SIZE;
}

function segmentsFor(object: SceneObject, settings: WaterSettings): number {
  const cap = DETAIL_CAPS[settings.reflectionResolution];
  if (settings.quality !== "auto") return Math.min(cap, QUALITY_SEGMENTS[settings.quality]);

  // Auto-density: target ~1.5 units per quad so close-up chop reads cleanly
  // on small ponds and we don't blow tri count on horizon-scale planes.
  const size = oceanSizeFor(object);
  const target = Math.round(size / 1.5);
  return Math.max(48, Math.min(cap, target));
}

function updateOceanMaterial(material: THREE.Material | THREE.Material[] | undefined, settings: WaterSettings): void {
  if (Array.isArray(material)) {
    material.forEach((item) => updateOceanMaterial(item, settings));
    return;
  }
  const physical = material as THREE.MeshPhysicalMaterial | undefined;
  if (!physical?.isMeshPhysicalMaterial) {
    console.error("[water] Water surfaces require MeshPhysicalMaterial in the WebGPU renderer.");
    return;
  }
  physical.color.set(settings.waterColor);
  physical.roughness = settings.roughness;
  const transparent = settings.opacity < 0.999;
  const depthWrite = !transparent;
  const pipelineStateChanged = physical.transparent !== transparent || physical.depthWrite !== depthWrite;
  physical.transparent = transparent;
  physical.opacity = settings.opacity;
  physical.depthWrite = depthWrite;
  // Color/roughness/opacity are live uniforms. Only transparency/depth state
  // changes require a WebGPU material/pipeline rebuild.
  if (pipelineStateChanged) physical.needsUpdate = true;
}

export function waterBodyKey(object: SceneObject): string {
  const settings = resolveWaterSettings(object.water);
  return `water:${WATER_BODY_VERSION}:${segmentsFor(object, settings)}`;
}

export function buildWaterBody(object: SceneObject): THREE.Mesh {
  const settings = resolveWaterSettings(object.water);
  const segments = segmentsFor(object, settings);
  const geometry = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, segments, segments);
  const material = new THREE.MeshPhysicalMaterial({
    color: settings.waterColor,
    roughness: settings.roughness,
    metalness: 0,
    transmission: 0,
    transparent: settings.opacity < 0.999,
    opacity: settings.opacity,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.name = object.name || "Ocean water surface";
  mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.originalMaterial = material;
  mesh.userData.waterSurface = true;
  mesh.userData.waterSettings = settings;
  mesh.userData.waterSegments = segments;
  return mesh;
}

export function syncWaterBody(body: THREE.Object3D, object: SceneObject): void {
  const mesh = body as THREE.Mesh;
  if (!mesh.isMesh) return;
  const settings = resolveWaterSettings(object.water);
  mesh.name = object.name || "Ocean water surface";
  mesh.userData.waterSettings = settings;
  updateOceanMaterial(mesh.userData.originalMaterial, settings);
  if (mesh.material !== mesh.userData.originalMaterial) updateOceanMaterial(mesh.material, settings);
}
