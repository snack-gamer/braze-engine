import { describe, expect, it } from "vitest";
import type { AvatarMaskAsset } from "../domain/avatar-mask";
import {
  addAvatarMaskTransform,
  patchAvatarMaskTransform,
  removeAvatarMaskTransform,
  setHumanoidBodyPartActive,
} from "./avatar-mask-authoring";

const MASK: AvatarMaskAsset = {
  version: 1,
  id: "mask",
  name: "Upper Body",
  humanoidBodyParts: {},
  transforms: [],
};

describe("Avatar Mask authoring operations", () => {
  it("toggles body regions immutably", () => {
    const updated = setHumanoidBodyPartActive(MASK, "leftArm", true);
    expect(updated.humanoidBodyParts).toEqual({ leftArm: true });
    expect(MASK.humanoidBodyParts).toEqual({});
  });

  it("normalizes, updates, deduplicates, and removes transform paths", () => {
    const withSpine = addAvatarMaskTransform(MASK, "/Root/Hips/Spine/");
    const duplicate = addAvatarMaskTransform(withSpine, "Root/Hips/Spine");
    const withHand = addAvatarMaskTransform(duplicate, "Root/Hips/Spine/LeftHand", { active: false });
    const renamed = patchAvatarMaskTransform(withHand, 1, { path: "/Root/LeftHand/", active: true });

    expect(withSpine.transforms).toEqual([{ path: "Root/Hips/Spine", active: true }]);
    expect(duplicate).toBe(withSpine);
    expect(renamed.transforms[1]).toEqual({ path: "Root/LeftHand", active: true });
    expect(removeAvatarMaskTransform(renamed, 0).transforms).toEqual([
      { path: "Root/LeftHand", active: true },
    ]);
  });
});
