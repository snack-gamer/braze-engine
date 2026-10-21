import * as THREE from "three";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";

/** Restores the target hips rest height after SkeletonUtils rebases motion to frame zero. */
export function restoreThreeRetargetHipBaseline(
  clip: THREE.AnimationClip,
  targetBoneName: string,
  baseline: THREE.Vector3,
): CharacterRuntimeResult<THREE.AnimationClip> {
  const tracks = clip.tracks.filter((track) => isBonePositionTrack(track, targetBoneName));
  if (tracks.length === 0) return characterRuntimeSuccess(clip);
  if (tracks.length > 1) return characterRuntimeFailure(
    "ambiguous-retarget-hips-translation",
    `Retargeted clip ${clip.name || "animation clip"} contains multiple hips position tracks.`,
  );
  const track = tracks[0]!;
  if (track.getValueSize() !== 3 || track.values.length !== track.times.length * 3) {
    return characterRuntimeFailure(
      "invalid-retarget-hips-translation",
      `Retargeted hips track ${JSON.stringify(track.name)} is not a bounded Vector3 track.`,
    );
  }
  if (![baseline.x, baseline.y, baseline.z].every(Number.isFinite)) {
    return characterRuntimeFailure(
      "invalid-retarget-hips-baseline",
      "The target Avatar hips rest position is not finite.",
    );
  }
  for (let offset = 0; offset < track.values.length; offset += 3) {
    track.values[offset] += baseline.x;
    track.values[offset + 1] += baseline.y;
    track.values[offset + 2] += baseline.z;
  }
  return characterRuntimeSuccess(clip);
}

function isBonePositionTrack(track: THREE.KeyframeTrack, boneName: string): boolean {
  try {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    const target = parsed.objectName === "bones" ? parsed.objectIndex : parsed.nodeName;
    return target === boneName && parsed.propertyName === "position";
  } catch {
    return false;
  }
}
