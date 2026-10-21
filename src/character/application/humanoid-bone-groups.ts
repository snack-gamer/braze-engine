import type { HumanoidBoneName } from "../domain/humanoid-avatar";

export type HumanoidBoneGroup = Readonly<{
  id: string;
  label: string;
  bones: readonly HumanoidBoneName[];
}>;

export const HUMANOID_BONE_GROUPS: readonly HumanoidBoneGroup[] = [
  {
    id: "body",
    label: "Body",
    bones: ["hips", "spine", "chest", "upperChest", "neck", "head", "jaw", "leftEye", "rightEye"],
  },
  {
    id: "arms",
    label: "Arms & Hands",
    bones: [
      "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
      "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
    ],
  },
  {
    id: "legs",
    label: "Legs & Feet",
    bones: [
      "leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes",
      "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes",
    ],
  },
  {
    id: "leftFingers",
    label: "Left Fingers",
    bones: [
      "leftThumbProximal", "leftThumbIntermediate", "leftThumbDistal",
      "leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal",
      "leftMiddleProximal", "leftMiddleIntermediate", "leftMiddleDistal",
      "leftRingProximal", "leftRingIntermediate", "leftRingDistal",
      "leftLittleProximal", "leftLittleIntermediate", "leftLittleDistal",
    ],
  },
  {
    id: "rightFingers",
    label: "Right Fingers",
    bones: [
      "rightThumbProximal", "rightThumbIntermediate", "rightThumbDistal",
      "rightIndexProximal", "rightIndexIntermediate", "rightIndexDistal",
      "rightMiddleProximal", "rightMiddleIntermediate", "rightMiddleDistal",
      "rightRingProximal", "rightRingIntermediate", "rightRingDistal",
      "rightLittleProximal", "rightLittleIntermediate", "rightLittleDistal",
    ],
  },
];
