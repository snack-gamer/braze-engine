import * as THREE from "three";
import type { CharacterDiagnostic } from "../../domain/diagnostics";
import type { RigImportSettings } from "../../domain/rig";
import {
  scanThreeCharacterModelWork,
  type ThreeCharacterModelWorkScan,
} from "./three-character-model-work-limits";
import { stripThreeBlendShapesFromScan } from "./three-rig-blend-shape-policy";

export {
  isMorphTargetTrack,
  stripThreeBlendShapes,
} from "./three-rig-blend-shape-policy";

export type ThreeRigImportPolicyResult = Readonly<{
  animations: readonly THREE.AnimationClip[];
  diagnostics: readonly CharacterDiagnostic[];
  changed: boolean;
  skinnedContent: boolean;
}>;

/** Applies deterministic loader-owned skin/morph policies before source caching. */
export function applyThreeRigImportPolicies(
  root: THREE.Object3D,
  animations: readonly THREE.AnimationClip[],
  settings: RigImportSettings,
): ThreeRigImportPolicyResult {
  const scan = scanThreeCharacterModelWork(root);
  const diagnostics: CharacterDiagnostic[] = [...scan.diagnostics];
  const skinnedContent = scan.skinnedMeshes.length > 0;
  if (!scan.accepted) {
    return { animations, diagnostics, changed: false, skinnedContent };
  }
  let changed = false;
  if (skinnedContent) {
    const influences = normalizeThreeSkinInfluencesFromScan(scan, settings.maxBoneInfluences);
    diagnostics.push(...influences.diagnostics);
    changed ||= influences.changed;
    if (settings.kind === "none") diagnostics.push({
      code: "skinned-content-without-rig",
      severity: "warning",
      message: "This model contains skinning, but its Animation Type is None.",
    });
  }
  if (settings.optimizeBones) diagnostics.push({
    code: "unsupported-bone-optimization",
    severity: "error",
    message: "Bone optimization requires a generated transform-remap artifact and was not applied.",
  });

  const blendShapes = settings.importBlendShapes
    ? { animations, diagnostics: [] as CharacterDiagnostic[], changed: false }
    : stripThreeBlendShapesFromScan(scan, animations);
  diagnostics.push(...blendShapes.diagnostics);
  changed ||= blendShapes.changed;
  return { animations: blendShapes.animations, diagnostics, changed, skinnedContent };
}

export function normalizeThreeSkinInfluences(
  root: THREE.Object3D,
  maxBoneInfluences: 1 | 2 | 4,
): Readonly<{ changed: boolean; diagnostics: readonly CharacterDiagnostic[] }> {
  const scan = scanThreeCharacterModelWork(root);
  if (!scan.accepted) return { changed: false, diagnostics: scan.diagnostics };
  return normalizeThreeSkinInfluencesFromScan(scan, maxBoneInfluences);
}

function normalizeThreeSkinInfluencesFromScan(
  scan: ThreeCharacterModelWorkScan,
  maxBoneInfluences: 1 | 2 | 4,
): Readonly<{ changed: boolean; diagnostics: readonly CharacterDiagnostic[] }> {
  const diagnostics: CharacterDiagnostic[] = [];
  const bindingsByGeometry = collectThreeSkinBindings(scan.skinnedMeshes);
  let changed = false;
  for (const [sourceGeometry, bindings] of bindingsByGeometry) {
    const usableBindings = bindings.filter((binding) => {
      if (binding.boneCount > 0) return true;
      diagnostics.push({
        code: "empty-skin-skeleton",
        severity: "error",
        message: `Skinned mesh ${skinBindingLabel(binding)} is bound to an empty skeleton; its skin weights were not modified.`,
      });
      return false;
    });
    if (usableBindings.length === 0) continue;

    const indices = sourceGeometry.getAttribute("skinIndex");
    const weights = sourceGeometry.getAttribute("skinWeight");
    if (!indices || !weights || indices.count !== weights.count) {
      diagnostics.push({
        code: "missing-skin-attributes",
        severity: "error",
        message: `Skinned mesh ${skinBindingLabel(usableBindings[0]!)} has no compatible skinIndex/skinWeight attributes.`,
      });
      continue;
    }

    const variants = planThreeSkinVariants(usableBindings, indices, weights, maxBoneInfluences);
    for (const variant of variants) diagnostics.push(...variant.plan.diagnostics);
    const outputs = mergeEquivalentSkinVariants(variants);
    const sourceIsShared = bindings.some((binding) => Boolean(binding.mesh.userData.sharedGeometry));
    const sourceOutput = outputs.find((output) => !output.plan.changed)
      ?? (!sourceIsShared && usableBindings.length === bindings.length ? outputs[0] : undefined);
    const geometryByOutput = new Map<ThreeSkinOutput, THREE.BufferGeometry>();

    // Build every isolated variant from the pristine source before the source-owned
    // variant is committed. Traversal order can therefore never corrupt a later plan.
    for (const output of outputs) {
      if (output === sourceOutput) continue;
      const geometry = sourceGeometry.clone();
      applyThreeSkinPlan(geometry, output.plan);
      geometryByOutput.set(output, geometry);
      changed = true;
    }
    if (sourceOutput) {
      applyThreeSkinPlan(sourceGeometry, sourceOutput.plan);
      geometryByOutput.set(sourceOutput, sourceGeometry);
      changed ||= sourceOutput.plan.changed;
    }
    for (const output of outputs) {
      const geometry = geometryByOutput.get(output);
      if (!geometry) continue;
      for (const binding of output.bindings) {
        binding.mesh.geometry = geometry;
        if (geometry !== sourceGeometry) binding.mesh.userData.sharedGeometry = false;
      }
    }
  }
  return { changed, diagnostics };
}

type ThreeSkinBinding = Readonly<{
  mesh: THREE.SkinnedMesh;
  boneCount: number;
}>;

type ThreeSkinPlan = Readonly<{
  indices: Uint16Array | Uint32Array;
  weights: Float32Array;
  changed: boolean;
  diagnostics: readonly CharacterDiagnostic[];
}>;

type ThreeSkinVariant = Readonly<{
  plan: ThreeSkinPlan;
  bindings: readonly ThreeSkinBinding[];
}>;

type ThreeSkinOutput = {
  plan: ThreeSkinPlan;
  bindings: ThreeSkinBinding[];
};

function collectThreeSkinBindings(
  meshes: readonly THREE.SkinnedMesh[],
): Map<THREE.BufferGeometry, ThreeSkinBinding[]> {
  const bindings = new Map<THREE.BufferGeometry, ThreeSkinBinding[]>();
  for (const mesh of meshes) {
    const geometryBindings = bindings.get(mesh.geometry) ?? [];
    geometryBindings.push({ mesh, boneCount: mesh.skeleton.bones.length });
    bindings.set(mesh.geometry, geometryBindings);
  }
  return bindings;
}

function planThreeSkinVariants(
  bindings: readonly ThreeSkinBinding[],
  indices: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  weights: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  maxBoneInfluences: 1 | 2 | 4,
): ThreeSkinVariant[] {
  const variants = new Map<number, ThreeSkinBinding[]>();
  for (const binding of bindings) {
    const matching = variants.get(binding.boneCount) ?? [];
    matching.push(binding);
    variants.set(binding.boneCount, matching);
  }
  return [...variants].map(([boneCount, matching]) => ({
    plan: createThreeSkinPlan(
      indices,
      weights,
      boneCount,
      maxBoneInfluences,
      skinBindingLabel(matching[0]!),
    ),
    bindings: matching,
  }));
}

function createThreeSkinPlan(
  indices: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  weights: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  boneCount: number,
  maxBoneInfluences: 1 | 2 | 4,
  meshLabel: string,
): ThreeSkinPlan {
  const nextIndices = boneCount <= 65_535
    ? new Uint16Array(weights.count * 4)
    : new Uint32Array(weights.count * 4);
  const nextWeights = new Float32Array(weights.count * 4);
  let prunedVertices = 0;
  let normalizedVertices = 0;
  let repairedVertices = 0;
  let invalidInfluences = 0;
  let changed = indices.itemSize !== 4 || weights.itemSize !== 4;
  for (let vertex = 0; vertex < weights.count; vertex += 1) {
    const influences: Array<{ index: number; weight: number; slot: number }> = [];
    const width = Math.min(4, indices.itemSize, weights.itemSize);
    let originalSum = 0;
    for (let slot = 0; slot < width; slot += 1) {
      const weight = weights.getComponent(vertex, slot);
      const index = indices.getComponent(vertex, slot);
      if (!Number.isFinite(weight) || weight <= 0) continue;
      if (!Number.isInteger(index) || index < 0 || index >= boneCount) {
        invalidInfluences += 1;
        continue;
      }
      influences.push({ index: Math.floor(index), weight, slot });
      originalSum += weight;
    }
    influences.sort((left, right) => right.weight - left.weight || left.slot - right.slot || left.index - right.index);
    if (influences.length > maxBoneInfluences) prunedVertices += 1;
    const retained = influences.slice(0, maxBoneInfluences);
    let retainedSum = retained.reduce((sum, influence) => sum + influence.weight, 0);
    if (!Number.isFinite(retainedSum) || retainedSum <= 1.0e-12) {
      retained.length = 0;
      retained.push({ index: 0, weight: 1, slot: 0 });
      retainedSum = 1;
      repairedVertices += 1;
    }
    if (Math.abs(originalSum - 1) > 1.0e-5 || retained.length !== influences.length) normalizedVertices += 1;
    retained.forEach((influence, slot) => {
      nextIndices[vertex * 4 + slot] = influence.index;
      nextWeights[vertex * 4 + slot] = influence.weight / retainedSum;
    });
    for (let slot = 0; slot < 4; slot += 1) {
      const originalIndex = slot < indices.itemSize ? indices.getComponent(vertex, slot) : 0;
      const originalWeight = slot < weights.itemSize ? weights.getComponent(vertex, slot) : 0;
      changed ||= originalIndex !== nextIndices[vertex * 4 + slot]
        || Math.abs(originalWeight - nextWeights[vertex * 4 + slot]!) > 1.0e-6;
    }
  }

  const diagnostics: CharacterDiagnostic[] = [];
  if (prunedVertices > 0) diagnostics.push({
    code: "skin-influences-pruned",
    severity: "info",
    message: `${meshLabel}: pruned skin weights on ${prunedVertices} vertices to ${maxBoneInfluences} influences.`,
  });
  if (normalizedVertices > 0) diagnostics.push({
    code: "skin-weights-normalized",
    severity: "info",
    message: `${meshLabel}: normalized skin weights on ${normalizedVertices} vertices.`,
  });
  if (repairedVertices > 0) diagnostics.push({
    code: "empty-skin-weights-repaired",
    severity: "warning",
    message: `${meshLabel}: assigned bone 0 to ${repairedVertices} vertices with no valid weights.`,
  });
  if (invalidInfluences > 0) diagnostics.push({
    code: "invalid-skin-influences-removed",
    severity: "warning",
    message: `${meshLabel}: removed ${invalidInfluences} skin weights with invalid bone indices.`,
  });
  return { indices: nextIndices, weights: nextWeights, changed, diagnostics };
}

function mergeEquivalentSkinVariants(variants: readonly ThreeSkinVariant[]): ThreeSkinOutput[] {
  const outputs: ThreeSkinOutput[] = [];
  for (const variant of variants) {
    const matching = outputs.find((output) => sameThreeSkinOutput(output.plan, variant.plan));
    if (matching) matching.bindings.push(...variant.bindings);
    else outputs.push({ plan: variant.plan, bindings: [...variant.bindings] });
  }
  return outputs;
}

function sameThreeSkinOutput(left: ThreeSkinPlan, right: ThreeSkinPlan): boolean {
  if (!left.changed && !right.changed) return true;
  if (left.indices.constructor !== right.indices.constructor
    || left.indices.length !== right.indices.length
    || left.weights.length !== right.weights.length) return false;
  for (let index = 0; index < left.indices.length; index += 1) {
    if (left.indices[index] !== right.indices[index] || left.weights[index] !== right.weights[index]) return false;
  }
  return true;
}

function applyThreeSkinPlan(geometry: THREE.BufferGeometry, plan: ThreeSkinPlan): void {
  if (!plan.changed) return;
  const indexAttribute = plan.indices instanceof Uint16Array
    ? new THREE.Uint16BufferAttribute(plan.indices, 4)
    : new THREE.Uint32BufferAttribute(plan.indices, 4);
  geometry.setAttribute("skinIndex", indexAttribute);
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(plan.weights, 4));
}

function skinBindingLabel(binding: ThreeSkinBinding): string {
  return binding.mesh.name || binding.mesh.type;
}
