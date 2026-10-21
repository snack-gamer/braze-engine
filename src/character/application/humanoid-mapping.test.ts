import { describe, expect, it } from "vitest";
import { boneId } from "../domain/skeleton";
import {
  suggestHumanoidMapping,
  validateHumanoidMapping,
  type HumanoidMappingBone,
} from "./humanoid-mapping";

function mixamoBones(): HumanoidMappingBone[] {
  const rows = [
    ["Hips", null],
    ["Spine", "Hips"], ["Spine1", "Spine"], ["Spine2", "Spine1"],
    ["Neck", "Spine2"], ["Head", "Neck"],
    ["LeftShoulder", "Spine2"], ["LeftArm", "LeftShoulder"], ["LeftForeArm", "LeftArm"], ["LeftHand", "LeftForeArm"],
    ["RightShoulder", "Spine2"], ["RightArm", "RightShoulder"], ["RightForeArm", "RightArm"], ["RightHand", "RightForeArm"],
    ["LeftUpLeg", "Hips"], ["LeftLeg", "LeftUpLeg"], ["LeftFoot", "LeftLeg"],
    ["RightUpLeg", "Hips"], ["RightLeg", "RightUpLeg"], ["RightFoot", "RightLeg"],
  ] as const;
  return rows.map(([name, parent]) => ({
    id: boneId(`bone:${name}`),
    name: `mixamorig${name}`,
    path: parent ? `Armature/${parent}/${name}` : `Armature/${name}`,
    parentId: parent ? boneId(`bone:${parent}`) : null,
  }));
}

function completeMixamoBranch(branch: string): HumanoidMappingBone[] {
  const core = [
    ["Hips", null],
    ["Spine", "Hips"], ["Spine1", "Spine"], ["Spine2", "Spine1"],
    ["Neck", "Spine2"], ["Head", "Neck"],
    ["LeftShoulder", "Spine2"], ["LeftArm", "LeftShoulder"], ["LeftForeArm", "LeftArm"], ["LeftHand", "LeftForeArm"],
    ["RightShoulder", "Spine2"], ["RightArm", "RightShoulder"], ["RightForeArm", "RightArm"], ["RightHand", "RightForeArm"],
    ["LeftUpLeg", "Hips"], ["LeftLeg", "LeftUpLeg"], ["LeftFoot", "LeftLeg"], ["LeftToeBase", "LeftFoot"],
    ["RightUpLeg", "Hips"], ["RightLeg", "RightUpLeg"], ["RightFoot", "RightLeg"], ["RightToeBase", "RightFoot"],
  ] as Array<readonly [string, string | null]>;
  for (const side of ["Left", "Right"] as const) {
    for (const finger of ["Thumb", "Index", "Middle", "Ring", "Pinky"] as const) {
      core.push([`${side}Hand${finger}1`, `${side}Hand`]);
      core.push([`${side}Hand${finger}2`, `${side}Hand${finger}1`]);
      core.push([`${side}Hand${finger}3`, `${side}Hand${finger}2`]);
    }
  }
  const byName = new Map<string, string>();
  return core.map(([name, parent]) => {
    const path = parent ? `${byName.get(parent)}/${name}` : `${branch}/${name}`;
    byName.set(name, path);
    return {
      id: boneId(`${branch}:${path}`),
      name: `mixamorig${name}`,
      path,
      parentId: parent ? boneId(`${branch}:${byName.get(parent)}`) : null,
    };
  });
}

describe("Humanoid mapping", () => {
  it("maps a Mixamo-style skeleton without relying on one hard-coded prefix", () => {
    const suggestion = suggestHumanoidMapping(mixamoBones());

    expect(suggestion.mapping).toMatchObject({
      hips: "bone:Hips",
      spine: "bone:Spine",
      chest: "bone:Spine1",
      upperChest: "bone:Spine2",
      leftUpperArm: "bone:LeftArm",
      rightLowerArm: "bone:RightForeArm",
      leftUpperLeg: "bone:LeftUpLeg",
      rightFoot: "bone:RightFoot",
    });
    expect(validateHumanoidMapping(mixamoBones(), suggestion.mapping).status).toBe("valid");
  });

  it("maps one complete skin hierarchy when an FBX repeats every Mixamo bone", () => {
    const surface = completeMixamoBranch("Beta_Surface");
    const joints = completeMixamoBranch("Beta_Joints");
    const bones = [...surface, ...joints];
    const suggestion = suggestHumanoidMapping(bones, {
      boneGroups: [surface.map((bone) => bone.id), joints.map((bone) => bone.id)],
    });

    expect(suggestion.rootBoneId).toBe(surface[0]?.id);
    expect(Object.keys(suggestion.mapping)).toHaveLength(52);
    expect(Object.values(suggestion.mapping).every((id) => String(id).startsWith("Beta_Surface:"))).toBe(true);
    expect(suggestion.mapping).toMatchObject({
      hips: surface.find((bone) => bone.name === "mixamorigHips")?.id,
      upperChest: surface.find((bone) => bone.name === "mixamorigSpine2")?.id,
      leftThumbDistal: surface.find((bone) => bone.name === "mixamorigLeftHandThumb3")?.id,
      rightLittleDistal: surface.find((bone) => bone.name === "mixamorigRightHandPinky3")?.id,
    });
    expect(validateHumanoidMapping(bones, suggestion.mapping).status).toBe("valid");
  });

  it("reports missing required mappings and invalid hierarchy deterministically", () => {
    const bones = mixamoBones();
    const result = validateHumanoidMapping(bones, {
      hips: boneId("bone:Hips"),
      spine: boneId("bone:Spine"),
      head: boneId("bone:Head"),
      leftUpperArm: boneId("bone:LeftArm"),
      leftLowerArm: boneId("bone:LeftForeArm"),
      leftHand: boneId("bone:LeftHand"),
      rightUpperArm: boneId("bone:RightArm"),
      rightLowerArm: boneId("bone:RightForeArm"),
      rightHand: boneId("bone:RightHand"),
      leftUpperLeg: boneId("bone:RightUpLeg"),
      leftLowerLeg: boneId("bone:LeftLeg"),
      leftFoot: boneId("bone:LeftFoot"),
    });

    expect(result.status).toBe("invalid");
    expect(result.issues.map((issue) => issue.code)).toContain("avatar-required-bone-missing");
    expect(result.issues.map((issue) => issue.code)).toContain("avatar-hierarchy-invalid");
  });
});
