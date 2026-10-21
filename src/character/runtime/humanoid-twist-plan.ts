import type {
  HumanoidAvatarDefinition,
  HumanoidBoneName,
} from "../domain/humanoid-avatar";
import type { BoneDefinition, BoneId, SkeletonDefinition } from "../domain/skeleton";
import type { CharacterQuaternion, CharacterVector3 } from "./pose-math";

export type RetargetTwistChainPlan = Readonly<{
  humanBone: HumanoidBoneName;
  targetChildHumanBone: HumanoidBoneName;
  targetBoneName: string;
  axis: CharacterVector3;
  distribution: number;
  helperBones: readonly Readonly<{
    targetBoneId: BoneId;
    targetBoneName: string;
    referenceLocalRotation: CharacterQuaternion;
    axis?: CharacterVector3;
  }>[];
}>;

const TWIST_SEGMENTS = [
  ["leftUpperArm", "leftLowerArm", "upperArmTwist"],
  ["rightUpperArm", "rightLowerArm", "upperArmTwist"],
  ["leftLowerArm", "leftHand", "lowerArmTwist"],
  ["rightLowerArm", "rightHand", "lowerArmTwist"],
  ["leftUpperLeg", "leftLowerLeg", "upperLegTwist"],
  ["rightUpperLeg", "rightLowerLeg", "upperLegTwist"],
  ["leftLowerLeg", "leftFoot", "lowerLegTwist"],
  ["rightLowerLeg", "rightFoot", "lowerLegTwist"],
] as const;

/** Finds explicitly named twist/roll helpers between mapped limb joints. */
export function compileHumanoidTwistPlans(
  skeleton: SkeletonDefinition,
  avatar: HumanoidAvatarDefinition,
  locals: ReadonlyMap<BoneId, CharacterQuaternion>,
): RetargetTwistChainPlan[] {
  const byId = new Map(skeleton.bones.map((bone) => [bone.id, bone]));
  const chains: RetargetTwistChainPlan[] = [];
  for (const [humanBone, childHumanBone, tuning] of TWIST_SEGMENTS) {
    const startId = avatar.mapping[humanBone];
    const childId = avatar.mapping[childHumanBone];
    const start = startId ? byId.get(startId) : undefined;
    const child = childId ? byId.get(childId) : undefined;
    if (!start || !child) continue;
    const between = bonesBetween(start, child, byId, skeleton.bones.length);
    if (!between) continue;
    const helpers = between.filter((bone) => /(?:twist|roll)/i.test(bone.name));
    if (helpers.length === 0) continue;
    const firstLink = between[0] ?? child;
    chains.push({
      humanBone,
      targetChildHumanBone: childHumanBone,
      targetBoneName: start.name,
      axis: normalizedAxis(firstLink.bindLocal.translation),
      distribution: avatar.tuning[tuning],
      helperBones: helpers.flatMap((bone) => {
        const rotation = locals.get(bone.id);
        const position = between.indexOf(bone);
        const next = between[position + 1] ?? child;
        return rotation ? [{
          targetBoneId: bone.id,
          targetBoneName: bone.name,
          referenceLocalRotation: rotation,
          axis: normalizedAxis(next.bindLocal.translation),
        }] : [];
      }),
    });
  }
  return chains;
}

function bonesBetween(
  start: BoneDefinition,
  child: BoneDefinition,
  byId: ReadonlyMap<BoneId, BoneDefinition>,
  maximum: number,
): BoneDefinition[] | null {
  const between: BoneDefinition[] = [];
  let cursor = child.parentId ? byId.get(child.parentId) : undefined;
  while (cursor && cursor.id !== start.id && between.length <= maximum) {
    between.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return cursor?.id === start.id ? between.reverse() : null;
}

function normalizedAxis(value: CharacterVector3): CharacterVector3 {
  const length = Math.hypot(...value);
  return length > 1.0e-8
    ? [value[0] / length, value[1] / length, value[2] / length]
    : [1, 0, 0];
}
