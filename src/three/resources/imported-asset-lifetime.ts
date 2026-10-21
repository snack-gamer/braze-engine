import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { disposeObject, retainObjectResource } from "../dispose";
import type { ResourceLease } from "./leased-resource-cache";
import type { CharacterDiagnostic } from "../../character/domain/diagnostics";

export type ImportedAssetSource = {
  object: THREE.Object3D;
  animations: THREE.AnimationClip[];
  /** Loader-time structured feedback; never a live Three object graph. */
  characterDiagnostics?: readonly CharacterDiagnostic[];
};

type MaterialSet = THREE.Material | THREE.Material[] | undefined;

function collectMaterials(target: Set<THREE.Material>, value: MaterialSet): void {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((material) => target.add(material));
    return;
  }
  target.add(value);
}

function collectMaterialTextures(material: THREE.Material, target: Set<THREE.Texture>): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) target.add(value);
  }
}

/** Disposes the loader-owned source graph after its final clone releases it. */
export function disposeImportedAssetSource(source: ImportedAssetSource): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  source.object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    collectMaterials(materials, mesh.material as MaterialSet);
    collectMaterials(materials, mesh.userData.originalMaterial as MaterialSet);
    const skinned = child as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh && skinned.skeleton) skeletons.add(skinned.skeleton);
  });
  materials.forEach((material) => collectMaterialTextures(material, textures));
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
  skeletons.forEach((skeleton) => skeleton.dispose());
  source.object.clear();
}

export function estimateImportedAssetBytes(source: ImportedAssetSource): number {
  const arrays = new Set<ArrayBufferView>();
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  source.object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      if (mesh.geometry.index) arrays.add(mesh.geometry.index.array);
      Object.values(mesh.geometry.attributes).forEach((attribute) => arrays.add(attribute.array));
      Object.values(mesh.geometry.morphAttributes).flat().forEach((attribute) => arrays.add(attribute.array));
    }
    collectMaterials(materials, mesh.material as MaterialSet);
  });
  materials.forEach((material) => collectMaterialTextures(material, textures));
  const geometryBytes = [...arrays].reduce((sum, array) => sum + array.byteLength, 0);
  const textureBytes = [...textures].reduce((sum, texture) => sum + estimateTextureBytes(texture), 0);
  return geometryBytes + textureBytes;
}

function estimateTextureBytes(texture: THREE.Texture): number {
  const image = texture.image as { data?: ArrayBufferView; width?: number; height?: number } | undefined;
  if (image?.data) return image.data.byteLength;
  const width = Math.max(0, Number(image?.width) || 0);
  const height = Math.max(0, Number(image?.height) || 0);
  return Math.round(width * height * 4 * (texture.generateMipmaps ? 4 / 3 : 1));
}

/**
 * Clones mutable transforms/materials while sharing immutable source geometry.
 * The lease makes the source geometry and its textures valid until disposal.
 */
export function cloneImportedAsset(
  lease: ResourceLease<Promise<ImportedAssetSource>>,
  source: ImportedAssetSource,
): THREE.Object3D {
  let clone: THREE.Object3D | null = null;
  try {
    clone = cloneSkeleton(source.object);
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.geometry) mesh.userData.sharedGeometry = true;
    });
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((material) => material.clone());
      else if (mesh.material) mesh.material = mesh.material.clone();
      mesh.userData.originalMaterial = mesh.material;
    });
    retainObjectResource(clone, lease.release);
    return clone;
  } catch (error) {
    if (clone) disposeObject(clone);
    lease.release();
    throw error;
  }
}

/** Used when ownership changes after cloning but before scene attachment. */
export function disposeStaleImportedClone(clone: THREE.Object3D): void {
  disposeObject(clone);
}
