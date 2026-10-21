import * as THREE from "three";
import type { Material } from "../types";
import { textureForMaterial } from "./texture-cache";
import type { PhysicalSurfaceMaterial } from "./material-surface";

/** Binds authored texture leases to the lifetime of one generated material. */
export function applyMaterialTextureBindings(
  material: PhysicalSurfaceMaterial,
  shared: Material,
): void {
  if (shared.baseColorTextureUrl) {
    material.map = textureForMaterial(
      material,
      shared.baseColorTextureUrl,
      THREE.SRGBColorSpace,
      shared.baseColorTextureFlipY ?? true,
    );
  }
  material.normalMap = shared.normalTextureUrl
    ? textureForMaterial(material, shared.normalTextureUrl, THREE.NoColorSpace, shared.normalTextureFlipY ?? true)
    : null;
  material.bumpMap = shared.bumpTextureUrl
    ? textureForMaterial(material, shared.bumpTextureUrl, THREE.NoColorSpace, shared.bumpTextureFlipY ?? true)
    : null;
  material.roughnessMap = shared.roughnessTextureUrl
    ? textureForMaterial(material, shared.roughnessTextureUrl, THREE.NoColorSpace, shared.roughnessTextureFlipY ?? true)
    : null;
  material.metalnessMap = shared.metalnessTextureUrl
    ? textureForMaterial(material, shared.metalnessTextureUrl, THREE.NoColorSpace, shared.metalnessTextureFlipY ?? true)
    : null;
  material.emissiveMap = shared.emissiveTextureUrl
    ? textureForMaterial(material, shared.emissiveTextureUrl, THREE.SRGBColorSpace, shared.emissiveTextureFlipY ?? true)
    : null;
  material.alphaMap = shared.alphaTextureUrl
    ? textureForMaterial(material, shared.alphaTextureUrl, THREE.NoColorSpace, shared.alphaTextureFlipY ?? true)
    : null;
  material.aoMap = shared.aoTextureUrl
    ? textureForMaterial(material, shared.aoTextureUrl, THREE.NoColorSpace, shared.aoTextureFlipY ?? true)
    : null;
  if (material.alphaMap) {
    material.transparent = true;
    material.alphaTest = Math.max(material.alphaTest, shared.alphaCutoff);
  }
  material.needsUpdate = true;
}
