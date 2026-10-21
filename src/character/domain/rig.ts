import type { AssetRef } from "../../assets/domain/asset-reference";
import {
  DEFAULT_HUMANOID_POSE_TUNING,
  HUMANOID_BONE_NAMES,
  type HumanBoneMapping,
  type HumanoidBoneName,
  type HumanoidPoseTuning,
} from "./humanoid-avatar";
import { boneId, type BoneId } from "./skeleton";

export type RigKind = "none" | "generic" | "humanoid";
export type BoneInfluenceLimit = 1 | 2 | 4;

export type AvatarSource =
  | { kind: "createFromModel" }
  | { kind: "copyFromAvatar"; avatarRef: AssetRef };

type SharedRigImportSettings = {
  importBlendShapes: boolean;
  maxBoneInfluences: BoneInfluenceLimit;
  /** Initially false; enabling this requires a generated transform-remap artifact. */
  optimizeBones: boolean;
};

export type RigImportSettings =
  | (SharedRigImportSettings & { kind: "none" })
  | (SharedRigImportSettings & {
      kind: "generic";
      rootBoneId?: BoneId;
      /** Bone used to extract authored locomotion, independent of the skeleton root. */
      motionRootBoneId?: BoneId;
    })
  | (SharedRigImportSettings & {
      kind: "humanoid";
      rootBoneId?: BoneId;
      /** Bone used to extract authored locomotion, independent of the skeleton root. */
      motionRootBoneId?: BoneId;
      avatarSource: AvatarSource;
      humanBoneMapping: HumanBoneMapping;
      humanoidTuning: HumanoidPoseTuning;
    });

export const DEFAULT_RIG_IMPORT_SETTINGS: RigImportSettings = {
  kind: "none",
  importBlendShapes: true,
  maxBoneInfluences: 4,
  optimizeBones: false,
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function avatarAssetRef(value: unknown): AssetRef | undefined {
  const input = record(value);
  const guid = typeof input?.guid === "string" ? input.guid.trim().toLowerCase() : "";
  if (!/^[a-f0-9]{32}$/.test(guid)) return undefined;
  const localId = input?.localId ?? input?.local_id;
  if (typeof localId !== "string" || !localId.trim()) return undefined;
  return { guid, localId: localId.trim() };
}

function humanMapping(value: unknown): HumanBoneMapping {
  const input = record(value);
  if (!input) return {};
  const output: HumanBoneMapping = {};
  for (const name of HUMANOID_BONE_NAMES) {
    const valueForBone = input[name];
    if (typeof valueForBone === "string" && valueForBone.trim()) {
      output[name as HumanoidBoneName] = boneId(valueForBone.trim());
    }
  }
  return output;
}

function influenceLimit(value: unknown): BoneInfluenceLimit {
  return value === 1 || value === 2 || value === 4 ? value : 4;
}

function finiteClamped(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(parsed) ? parsed : fallback));
}

export function normalizeHumanoidPoseTuning(value: unknown): HumanoidPoseTuning {
  const input = record(value) ?? {};
  return {
    armStretch: finiteClamped(input.armStretch ?? input.arm_stretch, DEFAULT_HUMANOID_POSE_TUNING.armStretch, 0, 1),
    legStretch: finiteClamped(input.legStretch ?? input.leg_stretch, DEFAULT_HUMANOID_POSE_TUNING.legStretch, 0, 1),
    upperArmTwist: finiteClamped(input.upperArmTwist ?? input.upper_arm_twist, DEFAULT_HUMANOID_POSE_TUNING.upperArmTwist, 0, 1),
    lowerArmTwist: finiteClamped(input.lowerArmTwist ?? input.lower_arm_twist, DEFAULT_HUMANOID_POSE_TUNING.lowerArmTwist, 0, 1),
    upperLegTwist: finiteClamped(input.upperLegTwist ?? input.upper_leg_twist, DEFAULT_HUMANOID_POSE_TUNING.upperLegTwist, 0, 1),
    lowerLegTwist: finiteClamped(input.lowerLegTwist ?? input.lower_leg_twist, DEFAULT_HUMANOID_POSE_TUNING.lowerLegTwist, 0, 1),
    feetSpacing: finiteClamped(input.feetSpacing ?? input.feet_spacing, DEFAULT_HUMANOID_POSE_TUNING.feetSpacing, -1, 1),
    hasTranslationDof: (input.hasTranslationDof ?? input.has_translation_dof) === true,
  };
}

/** Normalizes an in-memory authoring value; persisted aliases belong in the codec. */
export function normalizeRigImportSettings(value: unknown): RigImportSettings {
  const input = record(value) ?? {};
  const shared: SharedRigImportSettings = {
    importBlendShapes: input.importBlendShapes !== false,
    maxBoneInfluences: influenceLimit(input.maxBoneInfluences),
    optimizeBones: input.optimizeBones === true,
  };
  const rootBoneId = typeof input.rootBoneId === "string" && input.rootBoneId.trim()
    ? boneId(input.rootBoneId.trim())
    : undefined;
  const motionRootBoneId = typeof input.motionRootBoneId === "string" && input.motionRootBoneId.trim()
    ? boneId(input.motionRootBoneId.trim())
    : undefined;
  if (input.kind === "generic") {
    return {
      ...shared,
      kind: "generic",
      ...(rootBoneId ? { rootBoneId } : {}),
      ...(motionRootBoneId ? { motionRootBoneId } : {}),
    };
  }
  if (input.kind === "humanoid") {
    const source = record(input.avatarSource);
    const copied = source?.kind === "copyFromAvatar" ? avatarAssetRef(source.avatarRef) : undefined;
    const avatarSource: AvatarSource = copied
      ? { kind: "copyFromAvatar", avatarRef: copied }
      : { kind: "createFromModel" };
    return {
      ...shared,
      kind: "humanoid",
      ...(rootBoneId ? { rootBoneId } : {}),
      ...(motionRootBoneId ? { motionRootBoneId } : {}),
      avatarSource,
      humanBoneMapping: humanMapping(input.humanBoneMapping),
      humanoidTuning: normalizeHumanoidPoseTuning(input.humanoidTuning),
    };
  }
  return { ...shared, kind: "none" };
}
