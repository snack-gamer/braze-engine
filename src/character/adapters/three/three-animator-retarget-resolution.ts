import * as THREE from "three";
import type {
  AnimatorPlaybackAvatar,
  AnimatorPlaybackClip,
} from "../../application/playback/animator-playback-contracts";
import { assessGenericSkeletonCompatibility } from "../../runtime/skeleton-compatibility";
import { compileHumanoidRetargetPlan } from "../../runtime/retarget-plan";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import type { ThreeAnimatorClipResource } from "./three-animator-action-cache";
import { retargetThreeClipSafely } from "./three-retarget-adapter";
import { playbackRootMotionMetadata } from "./three-animator-imported-assets";
import {
  cacheThreeRetargetedClips,
  cachedThreeRetargetedClips,
} from "./three-retargeted-clip-cache";
import { threeRetargetTargetMeshes } from "./three-retarget-skeleton-binding";

type ExternalClipResolutionInput = Readonly<{
  clip: AnimatorPlaybackClip<ThreeAnimatorClipResource>;
  sourceRoot: THREE.Object3D;
  targetRoot: THREE.Object3D;
  sourceAvatar: AnimatorPlaybackAvatar;
  targetAvatar: AnimatorPlaybackAvatar;
  sourceRevision: string;
  targetRevision: string;
  settingsRevision: string;
}>;

const THREE_RETARGET_OUTPUT_REVISION = "hips-baseline-v1";

/** Resolves exact Generic compatibility or a cached Humanoid retarget bake. */
export function resolveExternalThreeAnimatorClip(
  input: ExternalClipResolutionInput,
): CharacterRuntimeResult<AnimatorPlaybackClip<ThreeAnimatorClipResource>> {
  const sourceClip = input.clip.resource.bindings[0]?.clip;
  if (!sourceClip) return characterRuntimeFailure(
    "missing-external-animation-clip",
    `External clip ${input.clip.id} has no Three resource.`,
  );
  if (input.sourceAvatar.kind === "generic" && input.targetAvatar.kind === "generic") {
    const compatibility = assessGenericSkeletonCompatibility(
      input.sourceAvatar.skeleton,
      input.targetAvatar.skeleton,
    );
    if (!compatibility.value) return { value: null, diagnostics: compatibility.diagnostics };
    return characterRuntimeSuccess({
      ...input.clip,
      resource: { bindings: [{ root: input.targetRoot, clip: sourceClip }] },
      metadata: {
        ...input.clip.metadata,
        rootMotion: playbackRootMotionMetadata(input.targetAvatar),
      },
    }, compatibility.diagnostics);
  }
  if (input.sourceAvatar.kind !== "humanoid" || input.targetAvatar.kind !== "humanoid") {
    return characterRuntimeFailure(
      "incompatible-animation-rig-kinds",
      `Clip ${input.clip.id} cannot retarget between ${input.sourceAvatar.kind} and ${input.targetAvatar.kind} rigs.`,
    );
  }
  const plan = compileHumanoidRetargetPlan({
    sourceSkeleton: input.sourceAvatar.skeleton,
    targetSkeleton: input.targetAvatar.skeleton,
    sourceAvatar: input.sourceAvatar.definition,
    targetAvatar: input.targetAvatar.definition,
    cacheIdentity: {
      sourceClipRevision: retargetSourceClipRevision(input.clip.id, input.sourceRevision),
      sourceSkeletonRevision: input.sourceAvatar.skeleton.compatibilitySignature,
      sourceAvatarRevision: input.sourceAvatar.definition.revision,
      targetSkeletonRevision: input.targetAvatar.skeleton.compatibilitySignature,
      targetAvatarRevision: input.targetAvatar.definition.revision,
      settingsRevision: `${input.settingsRevision}@${input.targetRevision}@${THREE_RETARGET_OUTPUT_REVISION}`,
    },
  });
  if (!plan.value) return { value: null, diagnostics: plan.diagnostics };
  const targets = threeRetargetTargetMeshes(input.targetRoot);
  let clips = cachedThreeRetargetedClips(plan.value.cacheKey);
  const diagnostics = [
    ...plan.diagnostics,
    ...externalRetargetTrackDiagnostics(sourceClip),
  ];
  if (!clips || clips.length !== targets.length) {
    const retargeted = retargetThreeClipSafely({
      sourceRoot: input.sourceRoot,
      targetRoot: input.targetRoot,
      sourceClip,
      plan: plan.value,
    });
    diagnostics.push(...retargeted.diagnostics);
    if (!retargeted.value) return { value: null, diagnostics };
    clips = retargeted.value.bindings.map((binding) => binding.clip);
    diagnostics.push(...cacheThreeRetargetedClips(plan.value.cacheKey, clips).diagnostics);
  }
  return characterRuntimeSuccess({
    ...input.clip,
    resource: {
      bindings: clips.map((clip, index) => ({ root: targets[index]!, clip })),
    },
    metadata: {
      ...input.clip.metadata,
      rootMotion: playbackRootMotionMetadata(input.targetAvatar),
    },
  }, diagnostics);
}

/** Reports source channels that Three's SkeletonUtils baker intentionally omits. */
export function externalRetargetTrackDiagnostics(
  sourceClip: THREE.AnimationClip,
): CharacterRuntimeDiagnostic[] {
  const hasMorphTargets = sourceClip.tracks.some((track) => {
    try {
      return THREE.PropertyBinding.parseTrackName(track.name).propertyName
        === "morphTargetInfluences";
    } catch {
      return false;
    }
  });
  return hasMorphTargets ? [{
    code: "external-retarget-morph-tracks-unsupported",
    severity: "warning",
    message: "Three Humanoid retargeting applies bone motion only; external facial and morph-target tracks are not transferred.",
  }] : [];
}

/** Prevents different clip subassets from sharing one model-revision cache entry. */
export function retargetSourceClipRevision(clipId: string, sourceRevision: string): string {
  return `${clipId}@${sourceRevision}`;
}
