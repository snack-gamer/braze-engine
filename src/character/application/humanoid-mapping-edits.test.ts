import { describe, expect, it } from "vitest";
import { boneId } from "../domain/skeleton";
import { assignHumanoidBone, clearHumanoidBone } from "./humanoid-mapping-edits";

describe("Humanoid mapping edits", () => {
  it("moves a source bone instead of assigning it to two roles", () => {
    const source = boneId("bone:arm");
    const mapping = { leftUpperArm: source };

    const next = assignHumanoidBone(mapping, "leftLowerArm", source);

    expect(next).toEqual({ leftLowerArm: source });
    expect(mapping).toEqual({ leftUpperArm: source });
  });

  it("replaces and clears assignments immutably", () => {
    const mapping = { hips: boneId("bone:old") };
    const assigned = assignHumanoidBone(mapping, "hips", boneId("bone:new"));
    const cleared = clearHumanoidBone(assigned, "hips");

    expect(assigned).toEqual({ hips: boneId("bone:new") });
    expect(cleared).toEqual({});
    expect(mapping).toEqual({ hips: boneId("bone:old") });
  });
});
