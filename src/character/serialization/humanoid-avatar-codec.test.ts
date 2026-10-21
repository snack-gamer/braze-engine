import { describe, expect, it } from "vitest";
import { REQUIRED_HUMANOID_BONES } from "../domain/humanoid-avatar";
import { CharacterCodecError } from "./character-codec-values";
import { decodeHumanoidAvatarDefinition, encodeHumanoidAvatarDefinition } from "./humanoid-avatar-codec";

const MODEL_GUID = "2".repeat(32);
const SKELETON_GUID = "3".repeat(32);

function completeMapping() {
  return Object.fromEntries(REQUIRED_HUMANOID_BONES.map((name) => [name, `bone:${name}`]));
}

function avatarDocument(mapping: Record<string, string> = completeMapping()) {
  return {
    id: "avatar:human",
    name: "Human",
    source_ref: { guid: MODEL_GUID, local_id: "main" },
    skeleton_ref: { guid: SKELETON_GUID, local_id: "skeleton:main" },
    mapping,
    reference_pose: {
      bones: { hips: { position: [0, 1, 0], rotation: [0, 0, 0, 1] } },
    },
    human_scale: 1.8,
    forward_axis: "+z",
    up_axis: "+y",
    tuning: { arm_stretch: 5, feet_spacing: -5 },
    muscle_limits: {
      leftUpperArm: { minimum: [-1, -2, -3], maximum: [1, 2, 3] },
      invalid: { minimum: [0, 0, 0], maximum: [1, 1, 1] },
    },
    validation: { issues: [] },
    futureAvatarMetadata: { retained: true },
  };
}

describe("humanoid Avatar codec", () => {
  it("migrates a complete mapping, clamps tuning, and round-trips", () => {
    const decoded = decodeHumanoidAvatarDefinition(avatarDocument());
    expect(decoded.validation).toEqual({ status: "valid", issues: [] });
    expect(decoded.revision).toBe("unversioned");
    expect(decoded.tuning.armStretch).toBe(1);
    expect(decoded.tuning.feetSpacing).toBe(-1);
    expect(decoded.muscleLimits?.leftUpperArm).toEqual({
      minimum: [-1, -2, -3],
      maximum: [1, 2, 3],
    });
    expect(decoded.extensions).toEqual({ futureAvatarMetadata: { retained: true } });
    expect(decodeHumanoidAvatarDefinition(encodeHumanoidAvatarDefinition(decoded))).toEqual(decoded);
  });

  it("derives actionable validation for missing and duplicate human bones", () => {
    const decoded = decodeHumanoidAvatarDefinition(avatarDocument({
      hips: "bone:shared",
      spine: "bone:shared",
    }));
    expect(decoded.validation.status).toBe("invalid");
    expect(decoded.validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "duplicate-human-bone-mapping", boneId: "bone:shared" }),
      expect.objectContaining({ code: "missing-required-human-bone", humanBone: "head" }),
    ]));
  });

  it("repairs collinear authored axes to the engine convention", () => {
    const decoded = decodeHumanoidAvatarDefinition({
      ...avatarDocument(),
      forward_axis: "-y",
      up_axis: "+y",
    });
    expect([decoded.forwardAxis, decoded.upAxis]).toEqual(["+z", "+y"]);
  });

  it("rejects invalid references and unsupported future versions", () => {
    expect(() => decodeHumanoidAvatarDefinition({ ...avatarDocument(), source_ref: { guid: "bad" } }))
      .toThrowError(CharacterCodecError);
    expect(() => decodeHumanoidAvatarDefinition({ version: "braze/humanoid-avatar-v2" }))
      .toThrowError(CharacterCodecError);
  });
});
