import {
  REQUIRED_HUMANOID_BONES,
  type HumanoidAvatarDefinition,
  type HumanoidBoneName,
  type HumanoidMuscleLimit,
} from "../domain/humanoid-avatar";
import type { BoneDefinition, BoneId, SkeletonDefinition } from "../domain/skeleton";
import {
  inverseCharacterQuaternion,
  multiplyCharacterQuaternions,
  normalizeCharacterQuaternion,
  type CharacterQuaternion,
} from "./pose-math";
import { DEFAULT_HUMANOID_MUSCLE_LIMIT } from "./humanoid-muscle-pose";
import {
  compileHumanoidTwistPlans,
  type RetargetTwistChainPlan,
} from "./humanoid-twist-plan";

export type { RetargetTwistChainPlan } from "./humanoid-twist-plan";
import {
  characterRuntimeSuccess,
  hasCharacterRuntimeErrors,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "./diagnostics";
import { retargetCacheKey, type RetargetCacheIdentity } from "./retarget-cache-key";
import { boneById } from "./skeleton-compatibility";
import { compileAxisAlignment } from "./axis-alignment";

export type RetargetBonePlan = Readonly<{
  humanBone: HumanoidBoneName;
  sourceBoneId: BoneId;
  targetBoneId: BoneId;
  sourceBoneName: string;
  targetBoneName: string;
  sourceBoneIndex: number;
  targetBoneIndex: number;
  /** Right offset applied after the adapter axis-aligns the source global rotation. */
  referenceRotationOffset: CharacterQuaternion;
  sourceReferenceLocalRotation?: CharacterQuaternion;
  targetReferenceLocalRotation?: CharacterQuaternion;
  sourceParentReferenceRotation?: CharacterQuaternion;
  targetParentReferenceRotation?: CharacterQuaternion;
  sourceMuscleLimit?: HumanoidMuscleLimit;
  targetMuscleLimit?: HumanoidMuscleLimit;
}>;

export type HumanoidRetargetPlan = Readonly<{
  version: 1;
  kind: "humanoid";
  cacheKey: string;
  sourceSkeletonSignature: string;
  targetSkeletonSignature: string;
  rootScale: number;
  rootAxisRotation: CharacterQuaternion;
  hips: RetargetBonePlan;
  bones: readonly RetargetBonePlan[];
  twistChains?: readonly RetargetTwistChainPlan[];
}>;

export type CompileHumanoidRetargetPlanOptions = Readonly<{
  sourceSkeleton: SkeletonDefinition;
  targetSkeleton: SkeletonDefinition;
  sourceAvatar: HumanoidAvatarDefinition;
  targetAvatar: HumanoidAvatarDefinition;
  cacheIdentity: RetargetCacheIdentity;
}>;

export function compileHumanoidRetargetPlan(
  options: CompileHumanoidRetargetPlanOptions,
): CharacterRuntimeResult<HumanoidRetargetPlan> {
  const { sourceSkeleton, targetSkeleton, sourceAvatar, targetAvatar } = options;
  const diagnostics: CharacterRuntimeDiagnostic[] = [];
  if (sourceAvatar.validation.status === "invalid" || targetAvatar.validation.status === "invalid") {
    diagnostics.push({
      code: "invalid-humanoid-avatar",
      severity: "error",
      message: "Retargeting requires valid source and target Avatars.",
    });
  }
  if (!Number.isFinite(sourceAvatar.humanScale) || sourceAvatar.humanScale <= 0
    || !Number.isFinite(targetAvatar.humanScale) || targetAvatar.humanScale <= 0) {
    diagnostics.push({
      code: "invalid-humanoid-scale",
      severity: "error",
      message: "Humanoid Avatars require a positive finite human scale.",
    });
  }
  const axisAlignment = compileAxisAlignment(
    sourceAvatar.forwardAxis,
    sourceAvatar.upAxis,
    targetAvatar.forwardAxis,
    targetAvatar.upAxis,
  );
  diagnostics.push(...axisAlignment.diagnostics);

  const sourceIndices = new Map(sourceSkeleton.bones.map((bone, index) => [bone.id, index]));
  const targetIndices = new Map(targetSkeleton.bones.map((bone, index) => [bone.id, index]));
  const sourceLocals = compileLocalReferenceRotations(
    sourceSkeleton,
    sourceAvatar,
    "source",
    diagnostics,
  );
  const targetLocals = compileLocalReferenceRotations(
    targetSkeleton,
    targetAvatar,
    "target",
    diagnostics,
  );
  const sourceReferences = compileGlobalReferenceRotations(
    sourceSkeleton,
    sourceLocals,
    "source",
    diagnostics,
  );
  const targetReferences = compileGlobalReferenceRotations(
    targetSkeleton,
    targetLocals,
    "target",
    diagnostics,
  );
  const rootAxisRotation = axisAlignment.value ?? [0, 0, 0, 1];
  const inverseRootAxisRotation = inverseCharacterQuaternion(rootAxisRotation);
  const usedSource = new Set<BoneId>();
  const usedTarget = new Set<BoneId>();
  const bones: RetargetBonePlan[] = [];
  for (const humanBone of unionMappedBones(sourceAvatar, targetAvatar)) {
    const sourceId = sourceAvatar.mapping[humanBone];
    const targetId = targetAvatar.mapping[humanBone];
    const required = REQUIRED_HUMANOID_BONES.includes(humanBone as typeof REQUIRED_HUMANOID_BONES[number]);
    if (!sourceId || !targetId) {
      if (required) diagnostics.push({
        code: "missing-required-humanoid-bone",
        severity: "error",
        message: `Required humanoid bone ${humanBone} is not mapped on both Avatars.`,
        path: humanBone,
      });
      continue;
    }
    const sourceBone = boneById(sourceSkeleton, sourceId);
    const targetBone = boneById(targetSkeleton, targetId);
    if (!sourceBone || !targetBone) {
      diagnostics.push({
        code: "missing-avatar-skeleton-bone",
        severity: "error",
        message: `Avatar mapping ${humanBone} references a bone absent from its skeleton.`,
        path: humanBone,
      });
      continue;
    }
    if (usedSource.has(sourceId) || usedTarget.has(targetId)) {
      diagnostics.push({
        code: "duplicate-humanoid-bone-mapping",
        severity: "error",
        message: `Avatar mapping ${humanBone} reuses a bone already assigned to another humanoid slot.`,
        path: humanBone,
      });
      continue;
    }
    usedSource.add(sourceId);
    usedTarget.add(targetId);
    const sourceRotation = sourceReferences.get(sourceId);
    const targetRotation = targetReferences.get(targetId);
    if (!sourceRotation || !targetRotation) continue;
    bones.push({
      humanBone,
      sourceBoneId: sourceId,
      targetBoneId: targetId,
      sourceBoneName: sourceBone.name,
      targetBoneName: targetBone.name,
      sourceBoneIndex: sourceIndices.get(sourceId)!,
      targetBoneIndex: targetIndices.get(targetId)!,
      // SkeletonUtils right-multiplies localOffsets onto an axis-aligned source
      // global rotation. This order makes the two authored global reference
      // rotations coincide exactly at the neutral pose.
      referenceRotationOffset: multiplyCharacterQuaternions(
        inverseCharacterQuaternion(sourceRotation),
        multiplyCharacterQuaternions(inverseRootAxisRotation, targetRotation),
      ),
      sourceReferenceLocalRotation: sourceLocals.get(sourceId),
      targetReferenceLocalRotation: targetLocals.get(targetId),
      sourceParentReferenceRotation: sourceBone.parentId
        ? sourceReferences.get(sourceBone.parentId)
        : [0, 0, 0, 1],
      targetParentReferenceRotation: targetBone.parentId
        ? targetReferences.get(targetBone.parentId)
        : [0, 0, 0, 1],
      sourceMuscleLimit: sourceAvatar.muscleLimits?.[humanBone]
        ?? DEFAULT_HUMANOID_MUSCLE_LIMIT,
      targetMuscleLimit: targetAvatar.muscleLimits?.[humanBone]
        ?? DEFAULT_HUMANOID_MUSCLE_LIMIT,
    });
  }
  const hips = bones.find((bone) => bone.humanBone === "hips");
  if (!hips) diagnostics.push({
    code: "missing-humanoid-hips",
    severity: "error",
    message: "Humanoid retargeting requires mapped hips on both Avatars.",
  });
  if (hasCharacterRuntimeErrors(diagnostics) || !hips || !axisAlignment.value) return { value: null, diagnostics };
  const twistChains = compileHumanoidTwistPlans(targetSkeleton, targetAvatar, targetLocals);
  return characterRuntimeSuccess({
    version: 1,
    kind: "humanoid",
    cacheKey: retargetCacheKey({
      ...options.cacheIdentity,
      semanticRevision: retargetSemanticRevision(
        targetAvatar.humanScale / sourceAvatar.humanScale,
        rootAxisRotation,
        bones,
        twistChains,
      ),
    }),
    sourceSkeletonSignature: sourceSkeleton.compatibilitySignature,
    targetSkeletonSignature: targetSkeleton.compatibilitySignature,
    rootScale: targetAvatar.humanScale / sourceAvatar.humanScale,
    rootAxisRotation,
    hips,
    bones,
    twistChains,
  }, diagnostics);
}

function compileLocalReferenceRotations(
  skeleton: SkeletonDefinition,
  avatar: HumanoidAvatarDefinition,
  side: "source" | "target",
  diagnostics: CharacterRuntimeDiagnostic[],
): Map<BoneId, CharacterQuaternion> {
  const authored = new Map<BoneId, CharacterQuaternion>();
  for (const [humanBone, id] of Object.entries(avatar.mapping) as Array<[HumanoidBoneName, BoneId]>) {
    const rotation = avatar.referencePose.bones[humanBone]?.rotation;
    if (rotation && !authored.has(id)) authored.set(id, rotation);
  }
  const locals = new Map<BoneId, CharacterQuaternion>();
  for (const bone of skeleton.bones) {
    const local = normalizeCharacterQuaternion(authored.get(bone.id) ?? bone.bindLocal.rotation);
    if (local) locals.set(bone.id, local);
    else diagnostics.push({
      code: "invalid-retarget-reference-rotation",
      severity: "error",
      message: `Retarget ${side} reference rotation is invalid for bone ${bone.name}.`,
      path: bone.path,
    });
  }
  return locals;
}

function compileGlobalReferenceRotations(
  skeleton: SkeletonDefinition,
  locals: ReadonlyMap<BoneId, CharacterQuaternion>,
  side: "source" | "target",
  diagnostics: CharacterRuntimeDiagnostic[],
): Map<BoneId, CharacterQuaternion> {
  const byId = new Map(skeleton.bones.map((bone) => [bone.id, bone]));
  const resolved = new Map<BoneId, CharacterQuaternion>();
  const invalid = new Set<BoneId>();
  const visiting = new Set<BoneId>();
  const resolve = (bone: BoneDefinition): CharacterQuaternion | null => {
    const cached = resolved.get(bone.id);
    if (cached) return cached;
    if (invalid.has(bone.id)) return null;
    if (visiting.has(bone.id)) {
      diagnostics.push({
        code: "cyclic-retarget-skeleton",
        severity: "error",
        message: `Retarget ${side} skeleton contains a cycle at bone ${bone.name}.`,
        path: bone.path,
      });
      invalid.add(bone.id);
      return null;
    }
    const local = locals.get(bone.id);
    if (!local) {
      diagnostics.push({
        code: "invalid-retarget-reference-rotation",
        severity: "error",
        message: `Retarget ${side} reference rotation is invalid for bone ${bone.name}.`,
        path: bone.path,
      });
      invalid.add(bone.id);
      return null;
    }
    visiting.add(bone.id);
    const parent = bone.parentId ? byId.get(bone.parentId) : undefined;
    if (bone.parentId && !parent) {
      diagnostics.push({
        code: "missing-retarget-parent-bone",
        severity: "error",
        message: `Retarget ${side} bone ${bone.name} references a missing parent.`,
        path: bone.path,
      });
      invalid.add(bone.id);
      visiting.delete(bone.id);
      return null;
    }
    const parentRotation = parent ? resolve(parent) : [0, 0, 0, 1] as const;
    visiting.delete(bone.id);
    if (!parentRotation) {
      invalid.add(bone.id);
      return null;
    }
    const global = multiplyCharacterQuaternions(parentRotation, local);
    resolved.set(bone.id, global);
    return global;
  };
  skeleton.bones.forEach(resolve);
  return resolved;
}

function retargetSemanticRevision(
  rootScale: number,
  rootAxisRotation: CharacterQuaternion,
  bones: readonly RetargetBonePlan[],
  twistChains: readonly RetargetTwistChainPlan[],
): string {
  const fields = [
    stableRetargetNumber(rootScale),
    ...rootAxisRotation.map(stableRetargetNumber),
    ...bones.flatMap((bone) => [
      bone.humanBone,
      ...bone.referenceRotationOffset.map(stableRetargetNumber),
      ...(bone.sourceReferenceLocalRotation ?? []).map(stableRetargetNumber),
      ...(bone.targetReferenceLocalRotation ?? []).map(stableRetargetNumber),
      ...(bone.sourceParentReferenceRotation ?? []).map(stableRetargetNumber),
      ...(bone.targetParentReferenceRotation ?? []).map(stableRetargetNumber),
      ...(bone.sourceMuscleLimit?.minimum ?? []).map(stableRetargetNumber),
      ...(bone.sourceMuscleLimit?.maximum ?? []).map(stableRetargetNumber),
      ...(bone.targetMuscleLimit?.minimum ?? []).map(stableRetargetNumber),
      ...(bone.targetMuscleLimit?.maximum ?? []).map(stableRetargetNumber),
    ]),
    ...twistChains.flatMap((chain) => [
      chain.humanBone,
      chain.targetChildHumanBone,
      stableRetargetNumber(chain.distribution),
      ...chain.axis.map(stableRetargetNumber),
      ...chain.helperBones.flatMap((bone) => [
        bone.targetBoneName,
        ...bone.referenceLocalRotation.map(stableRetargetNumber),
        ...(bone.axis ?? []).map(stableRetargetNumber),
      ]),
    ]),
  ];
  return fields.map((field) => `${field.length}:${field}`).join("");
}

function stableRetargetNumber(value: number): string {
  if (Object.is(value, -0)) return "0";
  return Number.isInteger(value) ? String(value) : value.toPrecision(12);
}

function unionMappedBones(
  source: HumanoidAvatarDefinition,
  target: HumanoidAvatarDefinition,
): HumanoidBoneName[] {
  return [...new Set([
    ...Object.keys(source.mapping),
    ...Object.keys(target.mapping),
    ...REQUIRED_HUMANOID_BONES,
  ] as HumanoidBoneName[])].sort();
}
