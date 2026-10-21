import type { BoneDefinition, BoneId, SkeletonDefinition } from "../domain/skeleton";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "./diagnostics";

export type SkeletonBoneMapping = Readonly<{
  sourceBoneId: BoneId;
  targetBoneId: BoneId;
  sourceIndex: number;
  targetIndex: number;
}>;

export type SkeletonCompatibility = Readonly<{
  kind: "exact";
  sourceSignature: string;
  targetSignature: string;
  boneMappings: readonly SkeletonBoneMapping[];
}>;

/** Generic rigs are compatible only when topology and bind-pose signatures match exactly. */
export function assessGenericSkeletonCompatibility(
  source: SkeletonDefinition,
  target: SkeletonDefinition,
): CharacterRuntimeResult<SkeletonCompatibility> {
  const sourceIssue = skeletonDefinitionIssue(source, "source");
  const targetIssue = skeletonDefinitionIssue(target, "target");
  if (sourceIssue || targetIssue) return characterRuntimeFailure(sourceIssue ?? targetIssue!);
  if (source.compatibilitySignature !== target.compatibilitySignature) {
    return characterRuntimeFailure({
      code: "incompatible-generic-skeleton",
      severity: "error",
      message: "Generic animation requires the same skeleton topology and bind pose.",
      details: {
        sourceBones: source.bones.length,
        targetBones: target.bones.length,
        sourceSignature: source.compatibilitySignature,
        targetSignature: target.compatibilitySignature,
      },
    });
  }
  const sourceByPath = new Map(source.bones.map((bone, index) => [bone.path, { bone, index }]));
  const boneMappings: SkeletonBoneMapping[] = [];
  for (let targetIndex = 0; targetIndex < target.bones.length; targetIndex += 1) {
    const targetBone = target.bones[targetIndex]!;
    const match = sourceByPath.get(targetBone.path);
    if (!match) {
      return characterRuntimeFailure({
        code: "missing-generic-bone",
        severity: "error",
        message: `Generic target bone ${targetBone.path} has no exact source match.`,
        path: targetBone.path,
      });
    }
    boneMappings.push({
      sourceBoneId: match.bone.id,
      targetBoneId: targetBone.id,
      sourceIndex: match.index,
      targetIndex,
    });
  }
  return characterRuntimeSuccess({
    kind: "exact",
    sourceSignature: source.compatibilitySignature,
    targetSignature: target.compatibilitySignature,
    boneMappings,
  });
}

function skeletonDefinitionIssue(skeleton: SkeletonDefinition, side: "source" | "target") {
  if (!skeleton.compatibilitySignature || skeleton.bones.length === 0) {
    return {
      code: "invalid-skeleton-definition",
      severity: "error" as const,
      message: `Retarget ${side} skeleton is empty or has no compatibility signature.`,
      path: side,
    };
  }
  const ids = new Set<BoneId>();
  const paths = new Set<string>();
  for (const bone of skeleton.bones) {
    if (!bone.id || !bone.path || ids.has(bone.id) || paths.has(bone.path)) {
      return {
        code: "ambiguous-skeleton-bone",
        severity: "error" as const,
        message: `Retarget ${side} skeleton contains a missing or duplicate bone identity.`,
        path: bone.path,
      };
    }
    ids.add(bone.id);
    paths.add(bone.path);
  }
  return null;
}

export function boneById(
  skeleton: SkeletonDefinition,
  id: BoneId | undefined,
): BoneDefinition | undefined {
  return id ? skeleton.bones.find((bone) => bone.id === id) : undefined;
}
