import type { CharacterValidationMetadata } from "../domain/diagnostics";
import { normalizeRigImportSettings, type RigImportSettings } from "../domain/rig";
import type { BoneId } from "../domain/skeleton";
import {
  suggestHumanoidMapping,
  validateHumanoidMapping,
  type HumanoidMappingBone,
} from "./humanoid-mapping";

/** Fills safe suggestions once; explicitly authored values always win. */
export function initializeRigFromSkeleton(
  rig: RigImportSettings,
  bones: readonly HumanoidMappingBone[],
  rootCandidates: readonly BoneId[],
  boneGroups: readonly (readonly BoneId[])[] = [],
): RigImportSettings {
  if (rig.kind === "none") return rig;
  const fallbackRoot = rig.rootBoneId ?? rootCandidates[0] ?? bones.find((bone) => bone.parentId === null)?.id;
  if (rig.kind === "generic") return normalizeRigImportSettings({
    ...rig,
    rootBoneId: fallbackRoot,
    motionRootBoneId: rig.motionRootBoneId ?? fallbackRoot,
  });
  if (rig.avatarSource.kind === "copyFromAvatar") return normalizeRigImportSettings({
    ...rig,
    rootBoneId: fallbackRoot,
    motionRootBoneId: rig.motionRootBoneId ?? fallbackRoot,
  });
  const suggestion = suggestHumanoidMapping(bones, { boneGroups });
  const mapping = { ...suggestion.mapping, ...rig.humanBoneMapping };
  return normalizeRigImportSettings({
    ...rig,
    rootBoneId: rig.rootBoneId ?? suggestion.rootBoneId ?? fallbackRoot,
    motionRootBoneId: rig.motionRootBoneId ?? mapping.hips ?? fallbackRoot,
    humanBoneMapping: mapping,
  });
}

export function validateConfiguredRig(
  rig: RigImportSettings,
  bones: readonly HumanoidMappingBone[],
  hasSkeleton: boolean,
  options: Readonly<{ copySourceAvailable?: boolean }> = {},
): CharacterValidationMetadata {
  if (!hasSkeleton) return invalid("avatar-skeleton-missing", "No skinned skeleton was found in this model.");
  if (rig.kind === "none") return invalid("avatar-rig-disabled", "Select Generic or Humanoid before configuring a rig.");
  if (!rig.rootBoneId || !bones.some((bone) => bone.id === rig.rootBoneId)) {
    return invalid("avatar-root-missing", "Choose a valid skeleton root.");
  }
  if (rig.motionRootBoneId && !bones.some((bone) => bone.id === rig.motionRootBoneId)) {
    return invalid("avatar-motion-root-missing", "The selected motion root is no longer present.");
  }
  if (rig.kind === "humanoid"
    && rig.avatarSource.kind === "copyFromAvatar"
    && options.copySourceAvailable === false) {
    return invalid(
      "avatar-copy-source-missing",
      "The copied Avatar source is missing or no longer valid. Choose another source Avatar.",
    );
  }
  if (rig.kind === "generic") {
    return { status: "valid", issues: [{ code: "rig-valid", severity: "info", message: "The skeleton roots are valid." }] };
  }
  return validateHumanoidMapping(bones, rig.humanBoneMapping);
}

function invalid(code: string, message: string): CharacterValidationMetadata {
  return { status: "invalid", issues: [{ code, severity: "error", message }] };
}
