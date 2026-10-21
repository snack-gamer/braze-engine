import {
  normalizeRigImportSettings,
  type RigImportSettings,
} from "../domain/rig";
import { acceptDocumentVersion, documentRecord, record, serializeAssetRef } from "./character-codec-values";

export const RIG_IMPORT_SETTINGS_FORMAT = "braze/rig-import-v2";

export function decodeRigImportSettings(value: unknown): RigImportSettings {
  if (value === undefined || value === null) return normalizeRigImportSettings(undefined);
  const input = documentRecord(value, "rig");
  acceptDocumentVersion(input, RIG_IMPORT_SETTINGS_FORMAT, ["braze/rig-import-v1", "braze/rig-import-v0"]);
  const avatarSource = record(input.avatarSource ?? input.avatar_source);
  return normalizeRigImportSettings({
    kind: input.kind ?? input.animationType ?? input.animation_type,
    importBlendShapes: input.importBlendShapes ?? input.import_blend_shapes,
    maxBoneInfluences: input.maxBoneInfluences ?? input.max_bone_influences,
    optimizeBones: input.optimizeBones ?? input.optimize_bones,
    rootBoneId: input.rootBoneId ?? input.root_bone_id,
    motionRootBoneId: input.motionRootBoneId ?? input.motion_root_bone_id,
    avatarSource: avatarSource
      ? {
          kind: avatarSource.kind,
          avatarRef: avatarSource.avatarRef ?? avatarSource.avatar_ref,
        }
      : undefined,
    humanBoneMapping: input.humanBoneMapping ?? input.human_bone_mapping,
    humanoidTuning: input.humanoidTuning ?? input.humanoid_tuning,
  });
}

export function encodeRigImportSettings(value: RigImportSettings) {
  const settings = normalizeRigImportSettings(value);
  const shared = {
    version: RIG_IMPORT_SETTINGS_FORMAT,
    kind: settings.kind,
    importBlendShapes: settings.importBlendShapes,
    maxBoneInfluences: settings.maxBoneInfluences,
    optimizeBones: settings.optimizeBones,
  };
  if (settings.kind === "none") return shared;
  if (settings.kind === "generic") {
    return {
      ...shared,
      ...(settings.rootBoneId ? { rootBoneId: settings.rootBoneId } : {}),
      ...(settings.motionRootBoneId ? { motionRootBoneId: settings.motionRootBoneId } : {}),
    };
  }
  return {
    ...shared,
    ...(settings.rootBoneId ? { rootBoneId: settings.rootBoneId } : {}),
    ...(settings.motionRootBoneId ? { motionRootBoneId: settings.motionRootBoneId } : {}),
    avatarSource: settings.avatarSource.kind === "copyFromAvatar"
      ? { kind: settings.avatarSource.kind, avatarRef: serializeAssetRef(settings.avatarSource.avatarRef) }
      : { kind: settings.avatarSource.kind },
    humanBoneMapping: { ...settings.humanBoneMapping },
    humanoidTuning: { ...settings.humanoidTuning },
  };
}
