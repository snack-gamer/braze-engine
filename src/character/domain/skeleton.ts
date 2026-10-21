import type { AssetRef } from "../../assets/domain/asset-reference";
import type { CharacterDocumentExtensions } from "./character-document";
import type { CharacterMatrix4, CharacterTransform } from "./character-values";

declare const boneIdBrand: unique symbol;

/** Stable importer-owned identity. It must not be derived from a runtime UUID. */
export type BoneId = string & { readonly [boneIdBrand]: "BoneId" };

export function boneId(value: string): BoneId {
  return value as BoneId;
}

export type BoneDefinition = {
  id: BoneId;
  name: string;
  /** Canonical root-relative source path, retained as a readable migration key. */
  path: string;
  parentId: BoneId | null;
  bindLocal: CharacterTransform;
  inverseBindMatrix: CharacterMatrix4;
};

export type SkeletonDefinition = {
  version: 1;
  id: string;
  name: string;
  sourceRef?: AssetRef;
  rootBoneIds: BoneId[];
  bones: BoneDefinition[];
  /** Bind-pose and topology signature used for exact Generic compatibility. */
  compatibilitySignature: string;
  extensions?: CharacterDocumentExtensions;
};

function stableNumber(value: number): string {
  if (Object.is(value, -0)) return "0";
  return Number.isInteger(value) ? String(value) : value.toPrecision(12);
}

function stableBoneDescription(bone: BoneDefinition): string {
  const transform = bone.bindLocal;
  return [
    bone.id,
    bone.parentId ?? "",
    bone.path,
    ...transform.translation.map(stableNumber),
    ...transform.rotation.map(stableNumber),
    ...transform.scale.map(stableNumber),
    ...bone.inverseBindMatrix.map(stableNumber),
  ].join("\u0001");
}

function fnv1a32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic fallback for legacy documents that predate importer signatures. */
export function deriveSkeletonCompatibilitySignature(bones: readonly BoneDefinition[]): string {
  const canonical = [...bones]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(stableBoneDescription)
    .join("\u0000");
  const first = fnv1a32(canonical, 0x811c9dc5).toString(16).padStart(8, "0");
  const second = fnv1a32(canonical, 0x9e3779b9).toString(16).padStart(8, "0");
  return `skeleton-v1-${first}${second}`;
}
