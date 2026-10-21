import * as THREE from "three";
import type { AvatarMaskAsset, HumanoidBodyPart } from "../../domain/avatar-mask";
import type { HumanoidBoneName } from "../../domain/humanoid-avatar";
import type { AnimatorPlaybackAvatar } from "../../application/playback/animator-playback-contracts";
import { getThreeObjectPath } from "./three-object-path";

type PathRule = Readonly<{ path: string; active: boolean }>;
type HumanoidPathRule = Readonly<{ path: string; part: HumanoidBodyPart }>;

/** Compiles one immutable Avatar Mask into a cheap per-track predicate. */
export function createThreeAvatarMaskTrackFilter(
  body: THREE.Object3D,
  mask: AvatarMaskAsset,
  avatar: AnimatorPlaybackAvatar | undefined,
): (track: THREE.KeyframeTrack) => boolean {
  const bonePaths = new Map(avatar?.skeleton.bones.map((bone) => [bone.id, normalizePath(bone.path)]) ?? []);
  const transformRules = mask.transforms
    .flatMap((item): PathRule[] => {
      const stablePath = item.boneId ? bonePaths.get(item.boneId) : undefined;
      const path = normalizePath(stablePath ?? item.path);
      return path ? [{ path, active: item.active }] : [];
    })
    .sort(longestPathFirst);
  const humanoidRules = avatar?.kind === "humanoid"
    ? humanoidPathRules(avatar, bonePaths)
    : [];

  return (track) => {
    const object = uniqueTrackTarget(body, track);
    if (!object) return false;
    const path = normalizePath(getThreeObjectPath(body, object));
    if (avatar?.kind === "humanoid") {
      const humanoid = humanoidRules.find((rule) => includesPath(rule.path, path));
      if (humanoid) return mask.humanoidBodyParts[humanoid.part] !== false;
    }
    if (transformRules.length === 0) return true;
    return transformRules.find((rule) => includesPath(rule.path, path))?.active ?? false;
  };
}

function uniqueTrackTarget(body: THREE.Object3D, track: THREE.KeyframeTrack): THREE.Object3D | null {
  let targetName = "";
  try {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    targetName = String(parsed.objectName === "bones" ? parsed.objectIndex : parsed.nodeName ?? "");
  } catch {
    return null;
  }
  const normalizedTarget = normalizePath(targetName);
  const matches: THREE.Object3D[] = [];
  body.traverse((object) => {
    const path = normalizePath(getThreeObjectPath(body, object));
    if (object.name === targetName || path === normalizedTarget) matches.push(object);
  });
  return matches.length === 1 ? matches[0]! : null;
}

function humanoidPathRules(
  avatar: Extract<AnimatorPlaybackAvatar, { kind: "humanoid" }>,
  bonePaths: ReadonlyMap<string, string>,
): HumanoidPathRule[] {
  return Object.entries(avatar.definition.mapping)
    .flatMap(([slot, boneId]): HumanoidPathRule[] => {
      const path = boneId ? bonePaths.get(boneId) : undefined;
      const part = HUMANOID_PART_BY_BONE[slot as HumanoidBoneName];
      return path && part ? [{ path, part }] : [];
    })
    .sort(longestPathFirst);
}

function includesPath(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}/`);
}

function normalizePath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, "");
}

function longestPathFirst(left: { path: string }, right: { path: string }): number {
  return right.path.length - left.path.length || left.path.localeCompare(right.path);
}

const HUMANOID_PART_BY_BONE: Record<HumanoidBoneName, HumanoidBodyPart> = {
  hips: "root",
  spine: "body",
  chest: "body",
  upperChest: "body",
  neck: "head",
  head: "head",
  leftEye: "head",
  rightEye: "head",
  jaw: "head",
  leftShoulder: "leftArm",
  leftUpperArm: "leftArm",
  leftLowerArm: "leftArm",
  rightShoulder: "rightArm",
  rightUpperArm: "rightArm",
  rightLowerArm: "rightArm",
  leftHand: "leftHand",
  leftThumbProximal: "leftHand",
  leftThumbIntermediate: "leftHand",
  leftThumbDistal: "leftHand",
  leftIndexProximal: "leftHand",
  leftIndexIntermediate: "leftHand",
  leftIndexDistal: "leftHand",
  leftMiddleProximal: "leftHand",
  leftMiddleIntermediate: "leftHand",
  leftMiddleDistal: "leftHand",
  leftRingProximal: "leftHand",
  leftRingIntermediate: "leftHand",
  leftRingDistal: "leftHand",
  leftLittleProximal: "leftHand",
  leftLittleIntermediate: "leftHand",
  leftLittleDistal: "leftHand",
  rightHand: "rightHand",
  rightThumbProximal: "rightHand",
  rightThumbIntermediate: "rightHand",
  rightThumbDistal: "rightHand",
  rightIndexProximal: "rightHand",
  rightIndexIntermediate: "rightHand",
  rightIndexDistal: "rightHand",
  rightMiddleProximal: "rightHand",
  rightMiddleIntermediate: "rightHand",
  rightMiddleDistal: "rightHand",
  rightRingProximal: "rightHand",
  rightRingIntermediate: "rightHand",
  rightRingDistal: "rightHand",
  rightLittleProximal: "rightHand",
  rightLittleIntermediate: "rightHand",
  rightLittleDistal: "rightHand",
  leftUpperLeg: "leftLeg",
  leftLowerLeg: "leftLeg",
  leftFoot: "leftLeg",
  leftToes: "leftLeg",
  rightUpperLeg: "rightLeg",
  rightLowerLeg: "rightLeg",
  rightFoot: "rightLeg",
  rightToes: "rightLeg",
};
