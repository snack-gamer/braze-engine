import * as THREE from "three";
import type { Material, SceneObject } from "../types";
import { activeDisplacerFor } from "./modifiers/displacer-material";
import {
  isModelSurface,
  makePhysicalMaterial,
  type MaterialSet,
  type PhysicalSurfaceMaterial,
} from "./material-surface";
import { applyMaterialTextureBindings } from "./material-texture-bindings";

function importedMaterialForSlot(
  object: SceneObject,
  slotKey: string | undefined,
  materialById: Map<string, Material>,
): Material | null {
  if (!slotKey || !object.importedMaterialBindings) return null;
  const binding = object.importedMaterialBindings.find((item) => item.slotKey === slotKey);
  return binding ? materialById.get(binding.materialId) ?? null : null;
}

function resolveOriginalSingleSurfaceMaterial(
  original: THREE.Material,
  object: SceneObject,
): THREE.Material {
  return makePhysicalMaterial(original, object.color, isModelSurface(object), {
    useObjectColor: !isModelSurface(object),
    useNodeMaterial: Boolean(activeDisplacerFor(object)),
  });
}

function applyMaterialScalarsToPhysical(
  target: PhysicalSurfaceMaterial,
  material: Material,
): void {
  target.color.set(material.color);
  target.roughness = material.roughness;
  target.metalness = material.metalness;
  target.specularIntensity = material.specularIntensity;
  target.clearcoat = material.clearcoat;
  target.clearcoatRoughness = material.clearcoatRoughness;
  target.ior = material.ior;
  const hasAlphaMap = Boolean(target.alphaMap);
  target.transmission = hasAlphaMap ? 0 : material.transmission;
  target.emissive.set(material.emissive);
  target.emissiveIntensity = material.emissiveIntensity;
  target.opacity = material.opacity;
  target.wireframe = material.wireframe;
  if (hasAlphaMap) {
    target.alphaTest = 0.5;
    target.transparent = true;
    target.depthWrite = true;
  } else {
    target.transparent = target.opacity < 1 || target.transmission > 0.01;
    target.depthWrite = !target.transparent;
  }
  target.needsUpdate = true;
}

function resolveSharedMaterial(
  source: THREE.Material | undefined,
  object: SceneObject,
  shared: Material,
): THREE.Material {
  const material = makePhysicalMaterial(source, object.color, isModelSurface(object), {
    useNodeMaterial: Boolean(activeDisplacerFor(object)),
  });
  applyMaterialScalarsToPhysical(material, shared);
  material.normalScale.setScalar(shared.normalScale);
  material.bumpScale = shared.bumpScale;
  material.aoMapIntensity = shared.aoIntensity;
  material.envMapIntensity = shared.envMapIntensity;
  material.thickness = shared.thickness;
  material.side = shared.side === "front"
    ? THREE.FrontSide
    : shared.side === "back" ? THREE.BackSide : THREE.DoubleSide;
  material.sheen = shared.sheen;
  material.sheenRoughness = shared.sheenRoughness;
  material.sheenColor.set(shared.sheenColor);
  applyMaterialTextureBindings(material, shared);
  return material;
}

function resolveOriginalSurfaceMaterial(
  original: MaterialSet | undefined,
  object: SceneObject,
): MaterialSet {
  if (!original) {
    return makePhysicalMaterial(undefined, object.color, false, {
      useNodeMaterial: Boolean(activeDisplacerFor(object)),
    });
  }
  if (Array.isArray(original)) {
    return original.map((material) => resolveOriginalSingleSurfaceMaterial(material, object));
  }
  return resolveOriginalSingleSurfaceMaterial(original, object);
}

function resolveSharedSurfaceMaterial(
  original: MaterialSet | undefined,
  object: SceneObject,
  material: Material,
): MaterialSet {
  if (Array.isArray(original)) {
    return original.map((source) => resolveSharedMaterial(source, object, material));
  }
  return resolveSharedMaterial(original, object, material);
}

function resolveImportedSurfaceMaterial(
  original: MaterialSet | undefined,
  object: SceneObject,
  materialById: Map<string, Material>,
  slotKeys?: string[],
): MaterialSet | null {
  if (!object.importedMaterialBindings || object.importedMaterialBindings.length === 0) return null;
  if (Array.isArray(original)) {
    let any = false;
    const next = original.map((source, index) => {
      const imported = importedMaterialForSlot(object, slotKeys?.[index], materialById);
      if (!imported) return resolveOriginalSingleSurfaceMaterial(source, object);
      any = true;
      return resolveSharedMaterial(source, object, imported);
    });
    return any ? next : null;
  }
  const imported = importedMaterialForSlot(object, slotKeys?.[0], materialById);
  return imported ? resolveSharedMaterial(original, object, imported) : null;
}

export function resolveMaterialSetForMesh(
  original: MaterialSet | undefined,
  object: SceneObject,
  shared: Material | null,
  materialById: Map<string, Material>,
  slotKeys?: string[],
): MaterialSet {
  if (shared) return resolveSharedSurfaceMaterial(original, object, shared);
  return resolveImportedSurfaceMaterial(original, object, materialById, slotKeys)
    ?? resolveOriginalSurfaceMaterial(original, object);
}
