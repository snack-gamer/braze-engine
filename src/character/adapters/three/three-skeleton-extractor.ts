import * as THREE from "three";
import type { AssetRef } from "../../../assets/domain/asset-reference";
import type { CharacterDiagnostic } from "../../domain/diagnostics";
import type { CharacterMatrix4 } from "../../domain/character-values";
import {
  boneId,
  deriveSkeletonCompatibilitySignature,
  type BoneDefinition,
  type BoneId,
  type SkeletonDefinition,
} from "../../domain/skeleton";
import { scanThreeCharacterModelWork } from "./three-character-model-work-limits";
import { getThreeObjectPath } from "./three-object-path";
import {
  importedNodeSourceIndex,
  importedNodeSourcePath,
} from "../../../three/imported-subasset-bindings";

export { bindExtractedThreeSkeleton } from "./three-skeleton-editor-binding";
export {
  createThreeSkeletonHelperOverlay,
  type ThreeSkeletonHelperOverlay,
} from "./three-skeleton-helper-overlay";
export { getThreeObjectPath } from "./three-object-path";

export type ThreeSkeletonAssetIdentity = Readonly<{
  id?: string;
  name?: string;
  sourceRef?: AssetRef;
}>;

export type ThreeSkinMembership = Readonly<{
  nodePath: string;
  name: string;
  boneIds: readonly BoneId[];
  maxBoneInfluences: number;
  nonNormalizedVertexCount: number;
}>;

export type ThreeMorphTarget = Readonly<{
  nodePath: string;
  name: string;
  index: number;
}>;

export type ThreeSkeletonExtraction = Readonly<{
  definition: SkeletonDefinition | null;
  diagnostics: readonly CharacterDiagnostic[];
  skins: readonly ThreeSkinMembership[];
  morphTargets: readonly ThreeMorphTarget[];
  rootCandidates: readonly BoneId[];
}>;

export type ThreeSkeletonExtractionOptions = Readonly<{
  /** Exact importer-published skin nodes to include; omitted means the whole model. */
  skinNodePaths?: readonly string[];
  skinSourceNodeIndices?: readonly number[];
}>;

export function hasThreeSkinnedContent(root: THREE.Object3D): boolean {
  return scanThreeCharacterModelWork(root).skinnedMeshes.length > 0;
}

/** Extracts deterministic authored rig metadata without retaining Three objects. */
export function extractThreeSkeletonDefinition(
  root: THREE.Object3D,
  assetIdentity: ThreeSkeletonAssetIdentity = {},
  options: ThreeSkeletonExtractionOptions = {},
): ThreeSkeletonExtraction {
  const scan = scanThreeCharacterModelWork(root);
  const diagnostics: CharacterDiagnostic[] = [...scan.diagnostics];
  if (!scan.accepted) return {
    definition: null,
    diagnostics,
    skins: [],
    morphTargets: [],
    rootCandidates: [],
  };
  root.updateMatrixWorld(true);
  const skinnedMeshes = collectSkinnedMeshes(root, scan.skinnedMeshes, options);
  if (skinnedMeshes.length === 0) {
    return {
      definition: null,
      diagnostics: [{
        code: "no-skinned-content",
        severity: "info",
        message: "The imported model contains no skinned meshes.",
      }],
      skins: [],
      morphTargets: collectMorphTargets(root, scan.meshes),
      rootCandidates: [],
    };
  }

  const bones = collectBones(root, skinnedMeshes, diagnostics);
  const paths = new Map(bones.map((bone) => [bone, getThreeObjectPath(root, bone)]));
  const ids = new Map(bones.map((bone) => [bone, boneId(`bone:${paths.get(bone)!}`)]));
  const inverseBinds = collectInverseBindMatrices(skinnedMeshes, diagnostics);
  const definitions: BoneDefinition[] = bones
    .map((bone) => {
      const parent = nearestBoneParent(bone, ids);
      return {
        id: ids.get(bone)!,
        name: bone.name || "Bone",
        path: paths.get(bone)!,
        parentId: parent ? ids.get(parent)! : null,
        bindLocal: restLocalTransform(root, bone, parent, inverseBinds),
        inverseBindMatrix: inverseBinds.get(bone) ?? synthesizedInverseBind(bone, diagnostics),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  appendDuplicateNameDiagnostics(definitions, diagnostics);
  const roots = definitions.filter((bone) => bone.parentId === null).map((bone) => bone.id);
  const skins = skinnedMeshes.map((mesh) => skinMembership(root, mesh, ids, diagnostics));
  const identity = assetIdentity.id?.trim() || assetRefIdentity(assetIdentity.sourceRef)
    || root.name.trim() || "imported-model";
  const definition: SkeletonDefinition = {
    version: 1,
    id: `${identity}:skeleton`,
    name: assetIdentity.name?.trim() || root.name.trim() || "Imported Skeleton",
    ...(assetIdentity.sourceRef ? { sourceRef: assetIdentity.sourceRef } : {}),
    rootBoneIds: roots,
    bones: definitions,
    compatibilitySignature: deriveSkeletonCompatibilitySignature(definitions),
  };
  return {
    definition,
    diagnostics,
    skins,
    morphTargets: collectMorphTargets(root, scan.meshes),
    rootCandidates: roots,
  };
}

function collectSkinnedMeshes(
  root: THREE.Object3D,
  meshes: readonly THREE.SkinnedMesh[],
  options: ThreeSkeletonExtractionOptions,
): THREE.SkinnedMesh[] {
  return [...meshes]
    .filter((mesh) => matchesThreeSkeletonExtractionTarget(root, mesh, options))
    .sort((left, right) => getThreeObjectPath(root, left).localeCompare(getThreeObjectPath(root, right)));
}

/** Shares exact importer-owned rig selection between extraction and preview presentation. */
export function matchesThreeSkeletonExtractionTarget(
  root: THREE.Object3D,
  mesh: THREE.SkinnedMesh,
  options: ThreeSkeletonExtractionOptions,
): boolean {
  if (options.skinNodePaths === undefined && options.skinSourceNodeIndices === undefined) return true;
  return options.skinNodePaths?.includes(
    importedNodeSourcePath(mesh) ?? getThreeObjectPath(root, mesh),
  ) === true || options.skinSourceNodeIndices?.includes(importedNodeSourceIndex(mesh) ?? -1) === true;
}

function collectBones(
  root: THREE.Object3D,
  meshes: readonly THREE.SkinnedMesh[],
  diagnostics: CharacterDiagnostic[],
): THREE.Bone[] {
  const bones = new Set<THREE.Bone>();
  for (const mesh of meshes) {
    for (const bone of mesh.skeleton.bones) {
      if (!bone) {
        diagnostics.push({
          code: "missing-skeleton-bone",
          severity: "error",
          message: `Skinned mesh ${mesh.name || mesh.type} has a missing skeleton bone.`,
        });
        continue;
      }
      const chain: THREE.Bone[] = [];
      let cursor: THREE.Object3D | null = bone;
      let withinRoot = false;
      while (cursor) {
        if (cursor === root) {
          if ((cursor as THREE.Bone).isBone) chain.push(cursor as THREE.Bone);
          withinRoot = true;
          break;
        }
        if ((cursor as THREE.Bone).isBone) chain.push(cursor as THREE.Bone);
        cursor = cursor.parent;
      }
      if (withinRoot) chain.forEach((item) => bones.add(item));
      else diagnostics.push({
          code: "bone-outside-import-root",
          severity: "error",
          message: `Bone ${bone.name || bone.uuid} is outside the imported model root.`,
        });
    }
  }
  return [...bones].sort((left, right) => getThreeObjectPath(root, left).localeCompare(getThreeObjectPath(root, right)));
}

function collectInverseBindMatrices(
  meshes: readonly THREE.SkinnedMesh[],
  diagnostics: CharacterDiagnostic[],
): Map<THREE.Bone, CharacterMatrix4> {
  const matrices = new Map<THREE.Bone, CharacterMatrix4>();
  for (const mesh of meshes) {
    mesh.skeleton.bones.forEach((bone, index) => {
      if (!bone) return;
      const inverse = mesh.skeleton.boneInverses[index];
      if (!inverse) return;
      const next = inverse.toArray() as CharacterMatrix4;
      const previous = matrices.get(bone);
      if (previous && !sameMatrix(previous, next)) diagnostics.push({
        code: "conflicting-inverse-bind-matrix",
        severity: "warning",
        message: `Bone ${bone.name || bone.uuid} has different inverse bind matrices across skins.`,
      });
      else if (!previous) matrices.set(bone, [...next] as CharacterMatrix4);
    });
  }
  return matrices;
}

function restLocalTransform(
  root: THREE.Object3D,
  bone: THREE.Bone,
  parent: THREE.Bone | null,
  inverseBinds: ReadonlyMap<THREE.Bone, CharacterMatrix4>,
): BoneDefinition["bindLocal"] {
  const inverseBind = inverseBinds.get(bone);
  const parentInverseBind = parent ? inverseBinds.get(parent) : undefined;
  if (!inverseBind || (parent && !parentInverseBind)) return {
    translation: bone.position.toArray() as [number, number, number],
    rotation: bone.quaternion.toArray() as [number, number, number, number],
    scale: bone.scale.toArray() as [number, number, number],
  };
  const restWorld = new THREE.Matrix4().fromArray(inverseBind).invert();
  const parentWorld = parentInverseBind
    ? new THREE.Matrix4().fromArray(parentInverseBind).invert()
    : root.matrixWorld;
  const local = parentWorld.clone().invert().multiply(restWorld);
  const translation = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  local.decompose(translation, rotation, scale);
  return {
    translation: translation.toArray() as [number, number, number],
    rotation: rotation.normalize().toArray() as [number, number, number, number],
    scale: scale.toArray() as [number, number, number],
  };
}

function synthesizedInverseBind(
  bone: THREE.Bone,
  diagnostics: CharacterDiagnostic[],
): CharacterMatrix4 {
  diagnostics.push({
    code: "synthesized-inverse-bind-matrix",
    severity: "warning",
    message: `Bone ${bone.name || bone.uuid} has no imported inverse bind matrix; one was reconstructed from its current rest pose.`,
  });
  return bone.matrixWorld.clone().invert().toArray() as CharacterMatrix4;
}

function skinMembership(
  root: THREE.Object3D,
  mesh: THREE.SkinnedMesh,
  ids: ReadonlyMap<THREE.Bone, BoneId>,
  diagnostics: CharacterDiagnostic[],
): ThreeSkinMembership {
  const influence = inspectSkinInfluences(mesh);
  if (influence.missingAttributes) diagnostics.push({
    code: "missing-skin-attributes",
    severity: "error",
    message: `Skinned mesh ${mesh.name || mesh.type} has no compatible skinIndex/skinWeight attributes.`,
  });
  if (influence.invalidJointIndices > 0) diagnostics.push({
    code: "invalid-skin-joint-index",
    severity: "error",
    message: `Skinned mesh ${mesh.name || mesh.type} contains ${influence.invalidJointIndices} invalid joint indices.`,
  });
  if (influence.nonNormalizedVertexCount > 0) diagnostics.push({
    code: "non-normalized-skin-weights",
    severity: "warning",
    message: `Skinned mesh ${mesh.name || mesh.type} has ${influence.nonNormalizedVertexCount} vertices with non-normalized weights.`,
  });
  return {
    nodePath: getThreeObjectPath(root, mesh),
    name: mesh.name || "Skinned Mesh",
    boneIds: mesh.skeleton.bones.flatMap((bone) => {
      const id = bone ? ids.get(bone) : undefined;
      return id ? [id] : [];
    }),
    maxBoneInfluences: influence.maxBoneInfluences,
    nonNormalizedVertexCount: influence.nonNormalizedVertexCount,
  };
}

function inspectSkinInfluences(mesh: THREE.SkinnedMesh) {
  const indices = mesh.geometry.getAttribute("skinIndex");
  const weights = mesh.geometry.getAttribute("skinWeight");
  if (!indices || !weights || indices.count !== weights.count) {
    return { missingAttributes: true, maxBoneInfluences: 0, nonNormalizedVertexCount: 0, invalidJointIndices: 0 };
  }
  let maxBoneInfluences = 0;
  let nonNormalizedVertexCount = 0;
  let invalidJointIndices = 0;
  for (let vertex = 0; vertex < weights.count; vertex += 1) {
    let sum = 0;
    let influences = 0;
    const width = Math.min(weights.itemSize, indices.itemSize);
    for (let slot = 0; slot < width; slot += 1) {
      const weight = weights.getComponent(vertex, slot);
      if (!Number.isFinite(weight) || weight <= 1.0e-8) continue;
      influences += 1;
      sum += weight;
      const joint = indices.getComponent(vertex, slot);
      if (!Number.isInteger(joint) || joint < 0 || joint >= mesh.skeleton.bones.length) invalidJointIndices += 1;
    }
    maxBoneInfluences = Math.max(maxBoneInfluences, influences);
    if (influences > 0 && Math.abs(sum - 1) > 1.0e-4) nonNormalizedVertexCount += 1;
  }
  return { missingAttributes: false, maxBoneInfluences, nonNormalizedVertexCount, invalidJointIndices };
}

function collectMorphTargets(
  root: THREE.Object3D,
  meshes: readonly THREE.Mesh[],
): ThreeMorphTarget[] {
  const targets: ThreeMorphTarget[] = [];
  for (const mesh of meshes) {
    const count = Math.max(0, ...Object.values(mesh.geometry.morphAttributes).map((items) => items.length));
    const names = new Map<number, string>();
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary ?? {})) names.set(index, name);
    for (let index = 0; index < count; index += 1) targets.push({
      nodePath: getThreeObjectPath(root, mesh),
      name: names.get(index) ?? `Morph ${index + 1}`,
      index,
    });
  }
  return targets.sort((left, right) => (
    left.nodePath.localeCompare(right.nodePath) || left.index - right.index || left.name.localeCompare(right.name)
  ));
}

function appendDuplicateNameDiagnostics(
  bones: readonly BoneDefinition[],
  diagnostics: CharacterDiagnostic[],
): void {
  const byName = new Map<string, BoneDefinition[]>();
  bones.forEach((bone) => byName.set(bone.name, [...(byName.get(bone.name) ?? []), bone]));
  const repeated = [...byName.entries()].filter(([, matches]) => matches.length > 1);
  if (repeated.length === 0) return;
  const duplicateInstances = repeated.reduce((count, [, matches]) => count + matches.length - 1, 0);
  diagnostics.push({
    code: "duplicate-bone-names",
    severity: "warning",
    message: `${repeated.length} bone names repeat across imported skin branches (${duplicateInstances} duplicate instances); Avatar mapping uses stable hierarchy paths.`,
  });
}

function nearestBoneParent(
  bone: THREE.Bone,
  ids: ReadonlyMap<THREE.Bone, BoneId>,
): THREE.Bone | null {
  let cursor = bone.parent;
  while (cursor) {
    if ((cursor as THREE.Bone).isBone && ids.has(cursor as THREE.Bone)) return cursor as THREE.Bone;
    cursor = cursor.parent;
  }
  return null;
}

function sameMatrix(left: CharacterMatrix4, right: CharacterMatrix4): boolean {
  return left.every((value, index) => Math.abs(value - right[index]!) <= 1.0e-7);
}

function assetRefIdentity(reference: AssetRef | undefined): string | undefined {
  return reference ? `${reference.guid}:${reference.localId ?? "main"}` : undefined;
}
