import type { AssetRef } from "../../assets/domain/asset-reference";
import type { CharacterDocumentExtensions } from "./character-document";
import type { CharacterValidationMetadata } from "./diagnostics";
import type { BoneId } from "./skeleton";
import type { CharacterAxis, CharacterTransform, CharacterVector3 } from "./character-values";

export const HUMANOID_BONE_NAMES = [
  "hips",
  "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg", "leftFoot", "rightFoot",
  "spine", "chest", "upperChest", "neck", "head",
  "leftShoulder", "rightShoulder", "leftUpperArm", "rightUpperArm",
  "leftLowerArm", "rightLowerArm", "leftHand", "rightHand",
  "leftToes", "rightToes", "leftEye", "rightEye", "jaw",
  "leftThumbProximal", "leftThumbIntermediate", "leftThumbDistal",
  "leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal",
  "leftMiddleProximal", "leftMiddleIntermediate", "leftMiddleDistal",
  "leftRingProximal", "leftRingIntermediate", "leftRingDistal",
  "leftLittleProximal", "leftLittleIntermediate", "leftLittleDistal",
  "rightThumbProximal", "rightThumbIntermediate", "rightThumbDistal",
  "rightIndexProximal", "rightIndexIntermediate", "rightIndexDistal",
  "rightMiddleProximal", "rightMiddleIntermediate", "rightMiddleDistal",
  "rightRingProximal", "rightRingIntermediate", "rightRingDistal",
  "rightLittleProximal", "rightLittleIntermediate", "rightLittleDistal",
] as const;

export type HumanoidBoneName = typeof HUMANOID_BONE_NAMES[number];
export type HumanBoneMapping = Partial<Record<HumanoidBoneName, BoneId>>;

export const REQUIRED_HUMANOID_BONES = [
  "hips",
  "spine",
  "head",
  "leftUpperArm", "leftLowerArm", "leftHand",
  "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot",
  "rightUpperLeg", "rightLowerLeg", "rightFoot",
] as const satisfies readonly HumanoidBoneName[];

export type HumanoidReferencePose = {
  space: "skeletonLocal";
  bones: Partial<Record<HumanoidBoneName, CharacterTransform>>;
};

/** Per-axis angular travel in radians around the Avatar's canonical frame. */
export type HumanoidMuscleLimit = {
  minimum: CharacterVector3;
  maximum: CharacterVector3;
};

export type HumanoidMuscleLimits = Partial<Record<HumanoidBoneName, HumanoidMuscleLimit>>;

export type HumanoidPoseTuning = {
  armStretch: number;
  legStretch: number;
  upperArmTwist: number;
  lowerArmTwist: number;
  upperLegTwist: number;
  lowerLegTwist: number;
  feetSpacing: number;
  hasTranslationDof: boolean;
};

export const DEFAULT_HUMANOID_POSE_TUNING: HumanoidPoseTuning = {
  armStretch: 0.05,
  legStretch: 0.05,
  upperArmTwist: 0.5,
  lowerArmTwist: 0.5,
  upperLegTwist: 0.5,
  lowerLegTwist: 0.5,
  feetSpacing: 0,
  hasTranslationDof: false,
};

export type HumanoidAvatarDefinition = {
  version: 1;
  id: string;
  name: string;
  revision: string;
  sourceRef: AssetRef;
  skeletonRef: AssetRef;
  mapping: HumanBoneMapping;
  referencePose: HumanoidReferencePose;
  /** Character height in authored meters, used to normalize root translation. */
  humanScale: number;
  forwardAxis: CharacterAxis;
  upAxis: CharacterAxis;
  tuning: HumanoidPoseTuning;
  /** Optional author limits; omitted slots use the safe full-rotation range. */
  muscleLimits?: HumanoidMuscleLimits;
  validation: CharacterValidationMetadata;
  extensions?: CharacterDocumentExtensions;
};
