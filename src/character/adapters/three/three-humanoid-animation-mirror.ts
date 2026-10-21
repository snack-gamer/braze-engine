import * as THREE from "three";
import type { AnimatorPlaybackAvatar } from "../../application/playback/animator-playback-contracts";
import type { HumanoidBoneName } from "../../domain/humanoid-avatar";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";

/** Mirrors canonical humanoid tracks across the Avatar's sagittal (local X) plane. */
export function mirrorThreeHumanoidTracks(
  tracks: readonly THREE.KeyframeTrack[],
  avatar: AnimatorPlaybackAvatar | undefined,
): CharacterRuntimeResult<readonly THREE.KeyframeTrack[]> {
  if (avatar?.kind !== "humanoid") return characterRuntimeFailure(
    "humanoid-mirror-avatar-required",
    "Mirrored Animator motion requires a resolved Humanoid Avatar.",
  );
  const names = mirroredBoneNames(avatar);
  return characterRuntimeSuccess(tracks.map((source) => mirrorTrack(source, names)));
}

function mirroredBoneNames(
  avatar: Extract<AnimatorPlaybackAvatar, { kind: "humanoid" }>,
): ReadonlyMap<string, string> {
  const boneNames = new Map(avatar.skeleton.bones.map((bone) => [bone.id, bone.name]));
  const mapping = avatar.definition.mapping;
  const output = new Map<string, string>();
  for (const [humanBone, boneId] of Object.entries(mapping) as Array<[HumanoidBoneName, typeof mapping[HumanoidBoneName]]>) {
    if (!boneId) continue;
    const name = boneNames.get(boneId);
    if (!name) continue;
    const counterpart = counterpartBone(humanBone);
    const counterpartId = counterpart ? mapping[counterpart] : undefined;
    const counterpartName = counterpartId ? boneNames.get(counterpartId) : undefined;
    output.set(
      THREE.PropertyBinding.sanitizeNodeName(name),
      THREE.PropertyBinding.sanitizeNodeName(counterpartName ?? name),
    );
  }
  return output;
}

function counterpartBone(name: HumanoidBoneName): HumanoidBoneName | null {
  if (name.startsWith("left")) return `right${name.slice(4)}` as HumanoidBoneName;
  if (name.startsWith("right")) return `left${name.slice(5)}` as HumanoidBoneName;
  return null;
}

function mirrorTrack(
  source: THREE.KeyframeTrack,
  mirroredNames: ReadonlyMap<string, string>,
): THREE.KeyframeTrack {
  const track = source.clone();
  let parsed: THREE.ParseTrackNameResults;
  try {
    parsed = THREE.PropertyBinding.parseTrackName(track.name);
  } catch {
    return track;
  }
  const mirroredNode = mirroredNames.get(parsed.nodeName);
  if (!mirroredNode) return track;
  track.name = replaceNodeName(track.name, parsed.nodeName, mirroredNode);
  if (parsed.propertyName === "position" && track.getValueSize() === 3) {
    for (let index = 0; index < track.values.length; index += 3) track.values[index] = -track.values[index]!;
  } else if (parsed.propertyName === "quaternion" && track.getValueSize() === 4) {
    for (let index = 0; index < track.values.length; index += 4) {
      track.values[index + 1] = -track.values[index + 1]!;
      track.values[index + 2] = -track.values[index + 2]!;
    }
  }
  return track;
}

function replaceNodeName(trackName: string, source: string, target: string): string {
  if (!source) return trackName;
  const index = trackName.indexOf(source);
  return index < 0
    ? trackName
    : `${trackName.slice(0, index)}${target}${trackName.slice(index + source.length)}`;
}
