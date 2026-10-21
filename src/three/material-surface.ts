import * as THREE from "three";
import { MeshPhysicalNodeMaterial } from "three/webgpu";
import type { SceneObject } from "../types";

export type MaterialSet = THREE.Material | THREE.Material[];
export type PhysicalSurfaceMaterial = THREE.MeshPhysicalMaterial | MeshPhysicalNodeMaterial;

type PhysicalSource = THREE.Material & {
  color?: THREE.Color;
  map?: THREE.Texture | null;
  lightMap?: THREE.Texture | null;
  lightMapIntensity?: number;
  aoMap?: THREE.Texture | null;
  aoMapIntensity?: number;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  emissiveMap?: THREE.Texture | null;
  bumpMap?: THREE.Texture | null;
  bumpScale?: number;
  normalMap?: THREE.Texture | null;
  normalScale?: THREE.Vector2;
  roughness?: number;
  roughnessMap?: THREE.Texture | null;
  metalness?: number;
  metalnessMap?: THREE.Texture | null;
  alphaMap?: THREE.Texture | null;
  envMap?: THREE.Texture | null;
  envMapIntensity?: number;
  specular?: THREE.Color;
  shininess?: number;
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isModelSurface(object: SceneObject): boolean {
  return object.primitive === "fbx"
    || object.primitive === "usdz"
    || object.primitive === "usd"
    || object.primitive === "gltf";
}

function copyMaterialFlags(target: THREE.Material, source: THREE.Material): void {
  target.name = source.name;
  target.blending = source.blending;
  target.depthTest = source.depthTest;
  target.depthWrite = source.depthWrite;
  target.opacity = source.opacity;
  target.polygonOffset = source.polygonOffset;
  target.polygonOffsetFactor = source.polygonOffsetFactor;
  target.polygonOffsetUnits = source.polygonOffsetUnits;
  target.side = source.side;
  target.toneMapped = source.toneMapped;
  target.transparent = source.transparent || source.opacity < 1;
  target.userData = { ...source.userData };
  target.visible = source.visible;
}

function roughnessFromSource(source: PhysicalSource | undefined): number {
  if (isNumber(source?.roughness)) return source.roughness;
  if (isNumber(source?.shininess)) {
    return clamp(1 - Math.sqrt(clamp(source.shininess, 0, 128) / 180), 0.38, 0.92);
  }
  return 0.72;
}

function specularFromSource(source: PhysicalSource | undefined): number {
  if (!source?.specular) return source instanceof THREE.MeshStandardMaterial ? 1 : 0.45;
  const luminance = source.specular.r * 0.2126 + source.specular.g * 0.7152 + source.specular.b * 0.0722;
  return clamp(luminance * 1.8, 0.18, 0.7);
}

function physicalMaterialFromSource(
  color: string,
  source?: THREE.Material,
  options: { useObjectColor?: boolean; useNodeMaterial?: boolean } = {},
): PhysicalSurfaceMaterial {
  const physicalSource = source as PhysicalSource | undefined;
  const MaterialClass = options.useNodeMaterial ? MeshPhysicalNodeMaterial : THREE.MeshPhysicalMaterial;
  const material = new MaterialClass({
    color: options.useObjectColor
      ? new THREE.Color(color)
      : physicalSource?.color?.clone() ?? new THREE.Color(color),
    roughness: roughnessFromSource(physicalSource),
    metalness: physicalSource?.metalness ?? 0,
    map: physicalSource?.map ?? null,
    lightMap: physicalSource?.lightMap ?? null,
    lightMapIntensity: physicalSource?.lightMapIntensity ?? 1,
    aoMap: physicalSource?.aoMap ?? null,
    aoMapIntensity: physicalSource?.aoMapIntensity ?? 1,
    emissive: physicalSource?.emissive?.clone() ?? new THREE.Color("#000000"),
    emissiveIntensity: physicalSource?.emissiveIntensity ?? 0,
    emissiveMap: physicalSource?.emissiveMap ?? null,
    bumpMap: physicalSource?.bumpMap ?? null,
    bumpScale: physicalSource?.bumpScale ?? 1,
    normalMap: physicalSource?.normalMap ?? null,
    normalScale: physicalSource?.normalScale?.clone() ?? new THREE.Vector2(1, 1),
    roughnessMap: physicalSource?.roughnessMap ?? null,
    metalnessMap: physicalSource?.metalnessMap ?? null,
    alphaMap: physicalSource?.alphaMap ?? null,
    envMap: physicalSource?.envMap ?? null,
    envMapIntensity: physicalSource?.envMapIntensity ?? 1,
    side: source?.side ?? THREE.DoubleSide,
    transparent: Boolean(source?.transparent)
      || (source?.opacity ?? 1) < 1
      || Boolean(physicalSource?.alphaMap),
    opacity: source?.opacity ?? 1,
  });
  if (source) copyMaterialFlags(material, source);
  material.specularIntensity = specularFromSource(physicalSource);
  if (physicalSource?.specular) material.specularColor.copy(physicalSource.specular);
  return material;
}

/** Rebuilds a surface as a node material while retaining its physical appearance. */
export function asNodeMaterial(source: THREE.Material, objectColor: string): MeshPhysicalNodeMaterial {
  return physicalMaterialFromSource(objectColor, source, { useNodeMaterial: true }) as MeshPhysicalNodeMaterial;
}

export function makePhysicalMaterial(
  source: THREE.Material | undefined,
  objectColor: string,
  stripSceneLighting = false,
  options: { useObjectColor?: boolean; useNodeMaterial?: boolean } = {},
): PhysicalSurfaceMaterial {
  const material = physicalMaterialFromSource(objectColor, source, options);
  if (stripSceneLighting) {
    material.lightMap = null;
    material.lightMapIntensity = 0;
    material.envMap = null;
    material.needsUpdate = true;
  }
  return material;
}
