import * as THREE from "three";
import type { AnimatorPoseApplication } from "../../application/playback/animator-playback-contracts";
import type { ThreeAnimatorClipResource } from "./three-animator-clip-resource";

export function prepareThreeAnimatorClip(
  source: THREE.AnimationClip,
  blendMode: "override" | "additive",
  tracks: readonly THREE.KeyframeTrack[],
): THREE.AnimationClip {
  const clip = source.clone();
  clip.tracks = tracks.map((track) => track.clone());
  if (blendMode === "additive") THREE.AnimationUtils.makeClipAdditive(clip);
  return clip;
}

export function threeAnimatorPlanTopologySignature(
  application: AnimatorPoseApplication<ThreeAnimatorClipResource>,
): string {
  const masks = [...application.masksById.values()];
  return JSON.stringify(application.plan.instructions.map((instruction) => {
    const mask = instruction.gpuMaskIndex === null ? undefined : masks[instruction.gpuMaskIndex];
    return [
      instruction.layerId,
      instruction.blendMode,
      mask ? [mask.id, mask.revision ?? null] : null,
      instruction.clips.map((sample) => [sample.clipId, sample.mirrored === true]),
    ];
  }));
}
