import * as THREE from "three";
import type { HumanoidRetargetPlan } from "../../runtime/retarget-plan";
import type { CharacterRuntimeDiagnostic } from "../../runtime/diagnostics";

export function chooseThreeRetargetSourceSkeleton(
  sourceRoot: THREE.Object3D,
  plan: HumanoidRetargetPlan,
  diagnostics: CharacterRuntimeDiagnostic[],
): THREE.Skeleton | null {
  const candidates = uniqueThreeSkeletonMeshes(sourceRoot).map((mesh, order) => ({
    skeleton: mesh.skeleton,
    order,
    score: plan.bones.filter((bone) => mesh.skeleton.getBoneByName(bone.sourceBoneName)).length,
  })).sort((left, right) => right.score - left.score || left.order - right.order);
  const best = candidates[0];
  if (!best || best.score === 0) {
    diagnostics.push({
      code: "missing-source-skeleton",
      severity: "error",
      message: "No source skeleton contains the Avatar's mapped bones.",
    });
    return null;
  }
  const requiredNames = new Set(plan.bones.map((bone) => bone.sourceBoneName));
  const counts = new Map<string, number>();
  best.skeleton.bones.forEach((bone) => counts.set(bone.name, (counts.get(bone.name) ?? 0) + 1));
  const ambiguous = [...requiredNames].filter((name) => (counts.get(name) ?? 0) > 1);
  if (ambiguous.length > 0) {
    diagnostics.push({
      code: "ambiguous-source-bone-name",
      severity: "error",
      message: `Three preview retargeting cannot bind duplicate source bone name ${JSON.stringify(ambiguous[0])}.`,
    });
    return null;
  }
  const availableNames = new Set(best.skeleton.bones.map((bone) => bone.name));
  const missing = [...requiredNames].filter((name) => !availableNames.has(name));
  if (missing.length > 0) diagnostics.push({
    code: "partial-source-skeleton",
    severity: "warning",
    message: `Source skin omits ${missing.length} mapped Avatar bones; available mappings will be retargeted.`,
  });
  return best.skeleton;
}

export function threeRetargetTargetNameMapping(
  skeleton: THREE.Skeleton,
  plan: HumanoidRetargetPlan,
  diagnostics: CharacterRuntimeDiagnostic[],
): Map<string, string> | null {
  const counts = new Map<string, number>();
  skeleton.bones.forEach((bone) => counts.set(bone.name, (counts.get(bone.name) ?? 0) + 1));
  const ambiguous = plan.bones.filter((bone) => (counts.get(bone.targetBoneName) ?? 0) > 1);
  if (ambiguous.length > 0) {
    diagnostics.push({
      code: "ambiguous-target-bone-name",
      severity: "error",
      message: `Three preview retargeting cannot bind duplicate target bone name ${JSON.stringify(ambiguous[0]!.targetBoneName)}.`,
    });
    return null;
  }
  const ambiguousTwist = (plan.twistChains ?? []).flatMap((chain) => chain.helperBones)
    .find((bone) => (counts.get(bone.targetBoneName) ?? 0) > 1);
  if (ambiguousTwist) {
    diagnostics.push({
      code: "ambiguous-target-twist-bone-name",
      severity: "error",
      message: `Three preview retargeting cannot bind duplicate twist bone name ${JSON.stringify(ambiguousTwist.targetBoneName)}.`,
    });
    return null;
  }
  const mapping = new Map<string, string>();
  for (const bone of plan.bones) {
    if (skeleton.getBoneByName(bone.targetBoneName)) mapping.set(bone.targetBoneName, bone.sourceBoneName);
  }
  const missing = plan.bones.filter((bone) => !mapping.has(bone.targetBoneName));
  if (missing.length > 0) diagnostics.push({
    code: "partial-target-skeleton",
    severity: "warning",
    message: `Target skin omits ${missing.length} mapped Avatar bones; available mappings will be retargeted.`,
  });
  if (!mapping.has(plan.hips.targetBoneName)) {
    diagnostics.push({
      code: "missing-target-hips",
      severity: "error",
      message: "Target skin does not contain the Avatar's mapped hips bone.",
    });
    return null;
  }
  return mapping;
}

export function uniqueThreeSkeletonMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.skeleton || skeletons.has(mesh.skeleton)) return;
    skeletons.add(mesh.skeleton);
    meshes.push(mesh);
  });
  return meshes;
}

/**
 * Selects independently animated target skins. Some FBX files add a second
 * skin whose bones are same-named children of the primary skin's bones. Those
 * children already inherit the primary pose and must not be retargeted again.
 */
export function threeRetargetTargetMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes = uniqueThreeSkeletonMeshes(root);
  const targets = meshes.filter((candidate) => !isNestedSkinAlias(candidate, meshes));
  return targets.length > 0 ? targets : meshes.slice(0, 1);
}

function isNestedSkinAlias(
  candidate: THREE.SkinnedMesh,
  meshes: readonly THREE.SkinnedMesh[],
): boolean {
  if (candidate.skeleton.bones.length === 0) return false;
  return meshes.some((primary) => {
    if (primary === candidate) return false;
    const primaryBones = new Set(primary.skeleton.bones);
    return candidate.skeleton.bones.every((bone) => (
      (bone.parent as THREE.Bone | null)?.isBone === true
      && bone.parent!.name === bone.name
      && primaryBones.has(bone.parent as THREE.Bone)
    ));
  });
}

export function validThreeRetargetQuaternion(
  value: unknown,
): value is readonly [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every(Number.isFinite)
    && value.reduce((sum, component) => sum + component * component, 0) > 1.0e-12;
}
