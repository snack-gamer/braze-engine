import type { AssetRef } from "../../assets/domain/asset-reference";
import type { CharacterDocumentExtensions } from "./character-document";
import type { BoneId } from "./skeleton";

export const HUMANOID_BODY_PARTS = [
  "root",
  "body",
  "head",
  "leftArm",
  "rightArm",
  "leftHand",
  "rightHand",
  "leftLeg",
  "rightLeg",
] as const;

export type HumanoidBodyPart = typeof HUMANOID_BODY_PARTS[number];

export type AvatarMaskTransform = {
  boneId?: BoneId;
  /** Root-relative fallback retained for skeleton migrations. */
  path: string;
  active: boolean;
};

export type AvatarMaskAsset = {
  version: 1;
  id: string;
  name: string;
  revision?: string;
  sourceRef?: AssetRef;
  humanoidBodyParts: Partial<Record<HumanoidBodyPart, boolean>>;
  transforms: AvatarMaskTransform[];
  extensions?: CharacterDocumentExtensions;
};
