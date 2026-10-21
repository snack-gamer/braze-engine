import type { CharacterDiagnostic } from "../domain/diagnostics";
import {
  DEFAULT_HUMANOID_POSE_TUNING,
  HUMANOID_BONE_NAMES,
  REQUIRED_HUMANOID_BONES,
  type HumanBoneMapping,
  type HumanoidAvatarDefinition,
  type HumanoidBoneName,
  type HumanoidMuscleLimits,
  type HumanoidPoseTuning,
  type HumanoidReferencePose,
} from "../domain/humanoid-avatar";
import { boneId } from "../domain/skeleton";
import type { CharacterTransform } from "../domain/character-values";
import {
  acceptDocumentVersion,
  clampedNumber,
  documentRecord,
  finiteNumber,
  optionalString,
  parseAssetRef,
  parseAxis,
  parseTransform,
  preservedDocumentFields,
  record,
  requiredString,
  serializeAssetRef,
  serializeTransform,
} from "./character-codec-values";

export const HUMANOID_AVATAR_FORMAT = "braze/humanoid-avatar-v1";

const HUMANOID_AVATAR_FIELDS = [
  "version", "id", "name", "revision", "sourceRef", "source_ref",
  "skeletonRef", "skeleton_ref", "mapping", "humanBoneMapping", "human_bone_mapping",
  "referencePose", "reference_pose", "humanScale", "human_scale",
  "forwardAxis", "forward_axis", "upAxis", "up_axis", "tuning", "validation",
  "muscleLimits", "muscle_limits",
] as const;

function decodeMapping(value: unknown): HumanBoneMapping {
  const input = record(value) ?? {};
  const mapping: HumanBoneMapping = {};
  for (const name of HUMANOID_BONE_NAMES) {
    const id = optionalString(input[name]);
    if (id) mapping[name] = boneId(id);
  }
  return mapping;
}

function decodeMuscleLimits(value: unknown): HumanoidMuscleLimits | undefined {
  const input = record(value);
  if (!input) return undefined;
  const limits: HumanoidMuscleLimits = {};
  for (const name of HUMANOID_BONE_NAMES) {
    const item = record(input[name]);
    const minimum = Array.isArray(item?.minimum) ? item.minimum : null;
    const maximum = Array.isArray(item?.maximum) ? item.maximum : null;
    if (!minimum || !maximum || minimum.length !== 3 || maximum.length !== 3) continue;
    const min = minimum.map(Number);
    const max = maximum.map(Number);
    if (!min.every((entry) => Number.isFinite(entry) && entry < 0)
      || !max.every((entry) => Number.isFinite(entry) && entry > 0)) continue;
    limits[name] = {
      minimum: min as [number, number, number],
      maximum: max as [number, number, number],
    };
  }
  return Object.keys(limits).length > 0 ? limits : undefined;
}

function decodeReferencePose(value: unknown): HumanoidReferencePose {
  const input = record(value) ?? {};
  const rawBones = record(input.bones) ?? {};
  const bones: Partial<Record<HumanoidBoneName, CharacterTransform>> = {};
  for (const name of HUMANOID_BONE_NAMES) {
    if (record(rawBones[name])) bones[name] = parseTransform(rawBones[name]);
  }
  return { space: "skeletonLocal", bones };
}

function decodeTuning(value: unknown): HumanoidPoseTuning {
  const input = record(value) ?? {};
  const defaults = DEFAULT_HUMANOID_POSE_TUNING;
  return {
    armStretch: clampedNumber(input.armStretch ?? input.arm_stretch, defaults.armStretch, 0, 1),
    legStretch: clampedNumber(input.legStretch ?? input.leg_stretch, defaults.legStretch, 0, 1),
    upperArmTwist: clampedNumber(input.upperArmTwist ?? input.upper_arm_twist, defaults.upperArmTwist, 0, 1),
    lowerArmTwist: clampedNumber(input.lowerArmTwist ?? input.lower_arm_twist, defaults.lowerArmTwist, 0, 1),
    upperLegTwist: clampedNumber(input.upperLegTwist ?? input.upper_leg_twist, defaults.upperLegTwist, 0, 1),
    lowerLegTwist: clampedNumber(input.lowerLegTwist ?? input.lower_leg_twist, defaults.lowerLegTwist, 0, 1),
    feetSpacing: clampedNumber(input.feetSpacing ?? input.feet_spacing, defaults.feetSpacing, -1, 1),
    hasTranslationDof: input.hasTranslationDof === true || input.has_translation_dof === true,
  };
}

function decodeIssues(value: unknown): CharacterDiagnostic[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): CharacterDiagnostic[] => {
    const input = record(item);
    const code = optionalString(input?.code);
    const message = optionalString(input?.message);
    if (!code || !message) return [];
    const severity = input?.severity === "error" || input?.severity === "warning" ? input.severity : "info";
    return [{
      code,
      message,
      severity,
      path: optionalString(input?.path),
      boneId: optionalString(input?.boneId ?? input?.bone_id),
      humanBone: optionalString(input?.humanBone ?? input?.human_bone),
    }];
  });
}

function mappingIssues(mapping: HumanBoneMapping): CharacterDiagnostic[] {
  const issues: CharacterDiagnostic[] = [];
  for (const humanBone of REQUIRED_HUMANOID_BONES) {
    if (!mapping[humanBone]) {
      issues.push({
        code: "missing-required-human-bone",
        severity: "error",
        message: `Required humanoid bone ${humanBone} is not mapped.`,
        humanBone,
      });
    }
  }
  const used = new Map<string, HumanoidBoneName>();
  for (const humanBone of HUMANOID_BONE_NAMES) {
    const mapped = mapping[humanBone];
    if (!mapped) continue;
    const previous = used.get(mapped);
    if (previous) {
      issues.push({
        code: "duplicate-human-bone-mapping",
        severity: "error",
        message: `${mapped} is mapped to both ${previous} and ${humanBone}.`,
        boneId: mapped,
        humanBone,
      });
    } else {
      used.set(mapped, humanBone);
    }
  }
  return issues;
}

function validationStatus(issues: readonly CharacterDiagnostic[]) {
  if (issues.some((issue) => issue.severity === "error")) return "invalid" as const;
  if (issues.some((issue) => issue.severity === "warning")) return "warning" as const;
  return "valid" as const;
}

export function decodeHumanoidAvatarDefinition(value: unknown): HumanoidAvatarDefinition {
  const input = documentRecord(value, "avatar");
  acceptDocumentVersion(input, HUMANOID_AVATAR_FORMAT, ["braze/humanoid-avatar-v0"]);
  const mapping = decodeMapping(input.mapping ?? input.humanBoneMapping ?? input.human_bone_mapping);
  const validation = record(input.validation);
  const issues = [
    ...decodeIssues(validation?.issues),
    ...mappingIssues(mapping),
  ].filter((issue, index, all) => all.findIndex(
    (candidate) => candidate.code === issue.code
      && candidate.boneId === issue.boneId
      && candidate.humanBone === issue.humanBone,
  ) === index);
  let forwardAxis = parseAxis(input.forwardAxis ?? input.forward_axis, "+z");
  let upAxis = parseAxis(input.upAxis ?? input.up_axis, "+y");
  if (forwardAxis.slice(1) === upAxis.slice(1)) {
    forwardAxis = "+z";
    upAxis = "+y";
  }
  const extensions = preservedDocumentFields(input, HUMANOID_AVATAR_FIELDS);
  return {
    version: 1,
    id: requiredString(input.id, "id"),
    name: requiredString(input.name, "name"),
    revision: optionalString(input.revision) ?? "unversioned",
    sourceRef: parseAssetRef(input.sourceRef ?? input.source_ref, "sourceRef", true)!,
    skeletonRef: parseAssetRef(input.skeletonRef ?? input.skeleton_ref, "skeletonRef", true)!,
    mapping,
    referencePose: decodeReferencePose(input.referencePose ?? input.reference_pose),
    humanScale: Math.max(0.0001, finiteNumber(input.humanScale ?? input.human_scale, 1)),
    forwardAxis,
    upAxis,
    tuning: decodeTuning(input.tuning),
    muscleLimits: decodeMuscleLimits(input.muscleLimits ?? input.muscle_limits),
    validation: { status: validationStatus(issues), issues },
    ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
  };
}

export function encodeHumanoidAvatarDefinition(value: HumanoidAvatarDefinition) {
  return {
    ...(value.extensions ?? {}),
    version: HUMANOID_AVATAR_FORMAT,
    id: value.id,
    name: value.name,
    revision: value.revision,
    sourceRef: serializeAssetRef(value.sourceRef),
    skeletonRef: serializeAssetRef(value.skeletonRef),
    mapping: { ...value.mapping },
    referencePose: {
      space: "skeletonLocal",
      bones: Object.fromEntries(
        Object.entries(value.referencePose.bones).map(([name, pose]) => [name, serializeTransform(pose)]),
      ),
    },
    humanScale: value.humanScale,
    forwardAxis: value.forwardAxis,
    upAxis: value.upAxis,
    tuning: { ...value.tuning },
    ...(value.muscleLimits ? { muscleLimits: Object.fromEntries(
      Object.entries(value.muscleLimits).map(([name, limit]) => [name, {
        minimum: [...limit.minimum],
        maximum: [...limit.maximum],
      }]),
    ) } : {}),
    validation: {
      status: value.validation.status,
      issues: value.validation.issues.map((issue) => ({ ...issue })),
    },
  };
}
