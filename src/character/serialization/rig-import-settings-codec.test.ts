import { describe, expect, it } from "vitest";
import { DEFAULT_RIG_IMPORT_SETTINGS } from "../domain/rig";
import { CharacterCodecError } from "./character-codec-values";
import { decodeRigImportSettings, encodeRigImportSettings } from "./rig-import-settings-codec";

const AVATAR_GUID = "a".repeat(32);

describe("rig import settings codec", () => {
  it("defaults missing settings to a semantic no-op rig", () => {
    expect(decodeRigImportSettings(undefined)).toEqual(DEFAULT_RIG_IMPORT_SETTINGS);
    expect(decodeRigImportSettings(undefined).kind).toBe("none");
  });

  it("migrates persisted aliases and round-trips Humanoid configuration", () => {
    const decoded = decodeRigImportSettings({
      animation_type: "humanoid",
      import_blend_shapes: false,
      max_bone_influences: 2,
      optimize_bones: true,
      root_bone_id: "skeleton/Hips",
      motion_root_bone_id: "skeleton/Motion",
      avatar_source: {
        kind: "copyFromAvatar",
        avatar_ref: { guid: AVATAR_GUID, local_id: "avatar:Human" },
      },
      human_bone_mapping: { hips: "skeleton/Hips", head: "skeleton/Head", unknown: "ignored" },
      humanoid_tuning: { arm_stretch: 2, lower_leg_twist: -1, feet_spacing: -4, has_translation_dof: true },
    });

    expect(decoded).toMatchObject({
      kind: "humanoid",
      importBlendShapes: false,
      maxBoneInfluences: 2,
      optimizeBones: true,
      rootBoneId: "skeleton/Hips",
      motionRootBoneId: "skeleton/Motion",
      avatarSource: { kind: "copyFromAvatar", avatarRef: { guid: AVATAR_GUID, localId: "avatar:Human" } },
      humanBoneMapping: { hips: "skeleton/Hips", head: "skeleton/Head" },
      humanoidTuning: {
        armStretch: 1,
        legStretch: 0.05,
        upperArmTwist: 0.5,
        lowerArmTwist: 0.5,
        upperLegTwist: 0.5,
        lowerLegTwist: 0,
        feetSpacing: -1,
        hasTranslationDof: true,
      },
    });
    expect(decodeRigImportSettings(encodeRigImportSettings(decoded))).toEqual(decoded);
  });

  it("keeps skeleton and motion roots distinct for Generic rigs", () => {
    const decoded = decodeRigImportSettings({
      kind: "generic",
      rootBoneId: "skeleton/Armature",
      motionRootBoneId: "skeleton/RootMotion",
    });
    expect(decoded).toMatchObject({
      kind: "generic",
      rootBoneId: "skeleton/Armature",
      motionRootBoneId: "skeleton/RootMotion",
    });
    expect(decodeRigImportSettings(encodeRigImportSettings(decoded))).toEqual(decoded);
  });

  it("falls back safely when a copied Avatar reference is malformed", () => {
    expect(decodeRigImportSettings({
      kind: "humanoid",
      avatarSource: { kind: "copyFromAvatar", avatarRef: { guid: "bad" } },
    })).toMatchObject({ avatarSource: { kind: "createFromModel" } });
    expect(decodeRigImportSettings({
      kind: "humanoid",
      avatarSource: { kind: "copyFromAvatar", avatarRef: { guid: AVATAR_GUID } },
    })).toMatchObject({ avatarSource: { kind: "createFromModel" } });
  });

  it("rejects unsupported future settings documents", () => {
    expect(() => decodeRigImportSettings({ version: "braze/rig-import-v3" }))
      .toThrowError(CharacterCodecError);
  });
});
