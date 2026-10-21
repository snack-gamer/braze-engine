import * as THREE from "three";
import {
  clone as cloneSkeleton,
  retargetClip,
} from "three/examples/jsm/utils/SkeletonUtils.js";
import type { HumanoidRetargetPlan } from "../../runtime/retarget-plan";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  hasCharacterRuntimeErrors,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import {
  assessThreeRetargetWorkload,
  THREE_RETARGET_WORK_LIMITS,
} from "./three-retarget-work-budget";
import {
  alignThreeRetargetSource,
  captureThreeRetargetPose,
  normalizeThreeRetargetTargetCoordinates,
  restoreThreeRetargetPose,
} from "./three-retarget-pose-isolation";
import { bakeThreeHumanoidMuscleTracks } from "./three-humanoid-muscle-bake";
import {
  chooseThreeRetargetSourceSkeleton,
  threeRetargetTargetMeshes,
  threeRetargetTargetNameMapping,
  validThreeRetargetQuaternion,
} from "./three-retarget-skeleton-binding";
import { restoreThreeRetargetHipBaseline } from "./three-retarget-root-translation";

export type ThreeRetargetedClipBinding = Readonly<{
  target: THREE.SkinnedMesh;
  clip: THREE.AnimationClip;
}>;

export type ThreeRetargetedClipSet = Readonly<{
  cacheKey: string;
  bindings: readonly ThreeRetargetedClipBinding[];
}>;

type RetargetThreeClipOptions = Readonly<{
  sourceRoot: THREE.Object3D;
  targetRoot: THREE.Object3D;
  sourceClip: THREE.AnimationClip;
  plan: HumanoidRetargetPlan;
  sampleRateHz?: number;
}>;

/**
 * Editor/small-scene adapter around Three's CPU retarget baker. The loader-owned
 * source is cloned, every touched pose is restored, and incompatibility returns
 * diagnostics instead of falling back to an unbound source clip.
 */
export function retargetThreeClipSafely(
  options: RetargetThreeClipOptions,
): CharacterRuntimeResult<ThreeRetargetedClipSet> {
  if (!Number.isFinite(options.sourceClip.duration) || options.sourceClip.duration <= 0
    || options.sourceClip.tracks.length === 0) return characterRuntimeFailure(
      "invalid-source-animation-clip",
      "Retargeting requires a non-empty source clip with a positive finite duration.",
    );
  if (options.sourceClip.duration > THREE_RETARGET_WORK_LIMITS.maximumDurationSeconds) {
    return characterRuntimeFailure(
      "retarget-duration-limit-exceeded",
      `Retarget duration exceeds the ${THREE_RETARGET_WORK_LIMITS.maximumDurationSeconds}-second synchronous bake limit.`,
    );
  }
  if (options.sourceClip.tracks.length > THREE_RETARGET_WORK_LIMITS.maximumSourceTracks) {
    return characterRuntimeFailure(
      "retarget-source-track-limit-exceeded",
      `Source animation exceeds the ${THREE_RETARGET_WORK_LIMITS.maximumSourceTracks}-track bake limit.`,
    );
  }
  if (!options.plan.cacheKey || !Number.isFinite(options.plan.rootScale) || options.plan.rootScale <= 0
    || options.plan.bones.length === 0 || !validThreeRetargetQuaternion(options.plan.rootAxisRotation)) {
    return characterRuntimeFailure(
      "invalid-retarget-plan",
      "The humanoid retarget plan is empty or invalid.",
    );
  }
  if (options.plan.bones.length > THREE_RETARGET_WORK_LIMITS.maximumMappedBones) {
    return characterRuntimeFailure(
      "retarget-mapped-bone-limit-exceeded",
      `Retarget mapping exceeds the ${THREE_RETARGET_WORK_LIMITS.maximumMappedBones}-bone bake limit.`,
    );
  }
  if (options.plan.bones.some((bone) => !validThreeRetargetQuaternion(bone.referenceRotationOffset))) {
    return characterRuntimeFailure(
      "invalid-retarget-plan",
      "The humanoid retarget plan is empty or invalid.",
    );
  }
  const diagnostics: CharacterRuntimeDiagnostic[] = [];
  const targets = threeRetargetTargetMeshes(options.targetRoot);
  if (targets.length === 0) return characterRuntimeFailure(
    "missing-target-skinned-mesh",
    "The retarget target contains no skinned mesh.",
  );
  if (targets.length > THREE_RETARGET_WORK_LIMITS.maximumTargetSkeletons) {
    return characterRuntimeFailure(
      "retarget-target-skeleton-limit-exceeded",
      `Retarget target exceeds the ${THREE_RETARGET_WORK_LIMITS.maximumTargetSkeletons}-skeleton bake limit.`,
    );
  }
  const preflightSourceSkeleton = chooseThreeRetargetSourceSkeleton(options.sourceRoot, options.plan, diagnostics);
  if (!preflightSourceSkeleton) return { value: null, diagnostics };
  const work = assessThreeRetargetWorkload({
    durationSeconds: options.sourceClip.duration,
    requestedSampleRateHz: options.sampleRateHz,
    mappedBoneCount: options.plan.bones.length,
    twistHelperBoneCount: new Set(
      (options.plan.twistChains ?? []).flatMap((chain) => (
        chain.helperBones.map((bone) => bone.targetBoneId)
      )),
    ).size,
    sourceSkeletonBoneCount: preflightSourceSkeleton.bones.length,
    targetSkeletonBoneCounts: targets.map((target) => target.skeleton.bones.length),
    sourceTracks: options.sourceClip.tracks,
  });
  diagnostics.push(...work.diagnostics);
  if (!work.value) return { value: null, diagnostics };

  let sourceClone: THREE.Object3D;
  try {
    sourceClone = cloneSkeleton(options.sourceRoot);
  } catch (error) {
    return characterRuntimeFailure(
      "source-rig-clone-failed",
      `Could not isolate the source rig for preview retargeting: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const sourcePose = captureThreeRetargetPose(sourceClone);
  const targetPose = captureThreeRetargetPose(options.targetRoot);
  const alignedSourceRoot = alignThreeRetargetSource(sourceClone, options.plan.rootAxisRotation);
  if (!alignedSourceRoot) {
    sourceClone.clear();
    return characterRuntimeFailure(
      "unsupported-source-retarget-root-transform",
      "The source model root has a singular transform and cannot be normalized for retargeting.",
    );
  }
  const restoreTargetCoordinates = normalizeThreeRetargetTargetCoordinates(options.targetRoot);
  if (!restoreTargetCoordinates) {
    sourceClone.removeFromParent();
    restoreThreeRetargetPose(sourcePose);
    alignedSourceRoot.clear();
    sourceClone.clear();
    return characterRuntimeFailure(
      "unsupported-target-retarget-root-transform",
      "The target model parent has a singular transform and cannot be isolated for retargeting.",
    );
  }
  const targetBakePose = captureThreeRetargetPose(options.targetRoot);
  try {
    const cloneDiagnostics: CharacterRuntimeDiagnostic[] = [];
    const sourceSkeleton = chooseThreeRetargetSourceSkeleton(sourceClone, options.plan, cloneDiagnostics);
    if (!sourceSkeleton) {
      diagnostics.push(...cloneDiagnostics);
      return { value: null, diagnostics };
    }
    const bindings: ThreeRetargetedClipBinding[] = [];
    for (const target of targets) {
      const mapping = threeRetargetTargetNameMapping(target.skeleton, options.plan, diagnostics);
      if (!mapping) continue;
      const targetHips = target.skeleton.getBoneByName(options.plan.hips.targetBoneName);
      if (!targetHips) {
        diagnostics.push({
          code: "missing-target-retarget-hips",
          severity: "error",
          message: `Target skin ${target.name || target.type} has no mapped hips bone.`,
        });
        continue;
      }
      const targetHipsBaseline = targetHips.position.clone();
      const localOffsets = Object.fromEntries(options.plan.bones.flatMap((bone) => {
        if (!mapping.has(bone.targetBoneName)) return [];
        const quaternion = new THREE.Quaternion(...bone.referenceRotationOffset);
        return [[bone.targetBoneName, new THREE.Matrix4().makeRotationFromQuaternion(quaternion)]];
      }));
      try {
        const compatibilityClip = retargetClip(target, sourceSkeleton, options.sourceClip, {
          fps: work.value.sampleRateHz,
          hip: options.plan.hips.sourceBoneName,
          hipInfluence: new THREE.Vector3(1, 1, 1),
          scale: options.plan.rootScale,
          preserveBoneMatrix: true,
          preserveBonePositions: true,
          useFirstFramePosition: true,
          localOffsets,
          getBoneName: (bone) => mapping.get(bone.name) ?? "",
        } as Parameters<typeof retargetClip>[3] & { preserveBonePositions?: boolean });
        const rootTranslation = restoreThreeRetargetHipBaseline(
          compatibilityClip,
          options.plan.hips.targetBoneName,
          targetHipsBaseline,
        );
        diagnostics.push(...rootTranslation.diagnostics);
        if (!rootTranslation.value) continue;
        const muscleBake = options.plan.bones.every((bone) => (
          bone.sourceReferenceLocalRotation
          && bone.targetReferenceLocalRotation
          && bone.sourceParentReferenceRotation
          && bone.targetParentReferenceRotation
          && bone.sourceMuscleLimit
          && bone.targetMuscleLimit
        )) ? bakeThreeHumanoidMuscleTracks({
          sourceRoot: sourceClone,
          sourceSkeleton,
          sourceClip: options.sourceClip,
          targetSkeleton: target.skeleton,
          baseClip: rootTranslation.value,
          plan: options.plan,
          sampleRateHz: work.value.sampleRateHz,
        }) : characterRuntimeSuccess(compatibilityClip);
        diagnostics.push(...muscleBake.diagnostics);
        const clip = muscleBake.value;
        if (!clip) continue;
        if (clip.tracks.length === 0) {
          diagnostics.push({
            code: "empty-retargeted-clip",
            severity: "error",
            message: `Retargeting produced no tracks for skinned mesh ${target.name || target.type}.`,
          });
          continue;
        }
        bindings.push({ target, clip });
      } catch (error) {
        diagnostics.push({
          code: "three-retarget-failed",
          severity: "error",
          message: `Could not retarget ${options.sourceClip.name || "animation clip"} to ${target.name || target.type}: ${error instanceof Error ? error.message : String(error)}`,
        });
      } finally {
        restoreThreeRetargetPose(targetBakePose);
      }
    }
    if (bindings.length === 0 || hasCharacterRuntimeErrors(diagnostics)) return { value: null, diagnostics };
    return characterRuntimeSuccess({ cacheKey: options.plan.cacheKey, bindings }, diagnostics);
  } finally {
    sourceClone.removeFromParent();
    restoreThreeRetargetPose(sourcePose);
    restoreTargetCoordinates();
    restoreThreeRetargetPose(targetPose);
    alignedSourceRoot.clear();
    sourceClone.clear();
  }
}
