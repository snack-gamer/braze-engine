import { describe, expect, it } from "vitest";
import { DEFAULT_HUMANOID_POSE_TUNING } from "../domain/humanoid-avatar";
import { boneId } from "../domain/skeleton";
import { initializeRigFromSkeleton, validateConfiguredRig } from "./avatar-configuration";
import type { HumanoidMappingBone } from "./humanoid-mapping";

const root = boneId("bone:Armature");
const hips = boneId("bone:Armature/Hips");

describe("Avatar configuration", () => {
  it("suggests separate skeleton and motion roots for a Generic rig", () => {
    const rig = initializeRigFromSkeleton({
      kind: "generic",
      importBlendShapes: true,
      maxBoneInfluences: 4,
      optimizeBones: false,
    }, simpleBones(), [root]);

    expect(rig).toMatchObject({ kind: "generic", rootBoneId: root, motionRootBoneId: root });
    expect(validateConfiguredRig(rig, simpleBones(), true).status).toBe("valid");
  });

  it("does not replace explicitly authored roots", () => {
    const rig = initializeRigFromSkeleton({
      kind: "generic",
      rootBoneId: hips,
      motionRootBoneId: hips,
      importBlendShapes: false,
      maxBoneInfluences: 2,
      optimizeBones: false,
    }, simpleBones(), [root]);

    expect(rig).toMatchObject({ rootBoneId: hips, motionRootBoneId: hips });
  });

  it("auto-maps and validates the required Humanoid chains", () => {
    const bones = humanoidBones();
    const rig = initializeRigFromSkeleton({
      kind: "humanoid",
      avatarSource: { kind: "createFromModel" },
      humanBoneMapping: {},
      humanoidTuning: DEFAULT_HUMANOID_POSE_TUNING,
      importBlendShapes: true,
      maxBoneInfluences: 4,
      optimizeBones: false,
    }, bones, [root]);

    expect(rig.kind).toBe("humanoid");
    expect(rig.kind === "humanoid" && rig.humanBoneMapping.hips).toBe(hips);
    expect(validateConfiguredRig(rig, bones, true).status).toBe("valid");
  });

  it("validates copied Avatar mappings against the target skeleton", () => {
    const bones = humanoidBones();
    const configured = initializeRigFromSkeleton({
      kind: "humanoid",
      avatarSource: {
        kind: "copyFromAvatar",
        avatarRef: { guid: "a".repeat(32), localId: "avatar:source" },
      },
      humanBoneMapping: suggestCopiedMapping(bones),
      humanoidTuning: DEFAULT_HUMANOID_POSE_TUNING,
      importBlendShapes: true,
      maxBoneInfluences: 4,
      optimizeBones: false,
    }, bones, [root]);
    expect(validateConfiguredRig(configured, bones, true).status).toBe("valid");
    expect(validateConfiguredRig(configured, bones, true, { copySourceAvailable: false }).issues[0]?.code)
      .toBe("avatar-copy-source-missing");
    const stale = configured.kind === "humanoid"
      ? { ...configured, humanBoneMapping: { ...configured.humanBoneMapping, hips: boneId("bone:missing") } }
      : configured;
    expect(validateConfiguredRig(stale, bones, true).issues.map((issue) => issue.code))
      .toContain("avatar-bone-missing");
  });

  it("blocks stale roots and models without a skeleton", () => {
    const rig = {
      kind: "generic" as const,
      rootBoneId: boneId("bone:missing"),
      importBlendShapes: true,
      maxBoneInfluences: 4 as const,
      optimizeBones: false,
    };
    expect(validateConfiguredRig(rig, simpleBones(), true).issues[0]?.code).toBe("avatar-root-missing");
    expect(validateConfiguredRig(rig, simpleBones(), false).issues[0]?.code).toBe("avatar-skeleton-missing");
  });
});

function simpleBones(): HumanoidMappingBone[] {
  return [
    { id: root, name: "Armature", path: "Armature", parentId: null },
    { id: hips, name: "Hips", path: "Armature/Hips", parentId: root },
  ];
}

function suggestCopiedMapping(bones: HumanoidMappingBone[]) {
  const byName = new Map(bones.map((bone) => [bone.name, bone.id]));
  return {
    hips: byName.get("Hips"), spine: byName.get("Spine"), head: byName.get("Head"),
    leftUpperArm: byName.get("LeftArm"), leftLowerArm: byName.get("LeftForeArm"), leftHand: byName.get("LeftHand"),
    rightUpperArm: byName.get("RightArm"), rightLowerArm: byName.get("RightForeArm"), rightHand: byName.get("RightHand"),
    leftUpperLeg: byName.get("LeftUpLeg"), leftLowerLeg: byName.get("LeftLeg"), leftFoot: byName.get("LeftFoot"),
    rightUpperLeg: byName.get("RightUpLeg"), rightLowerLeg: byName.get("RightLeg"), rightFoot: byName.get("RightFoot"),
  };
}

function humanoidBones(): HumanoidMappingBone[] {
  const specs: Array<[string, string, string | null]> = [
    ["Armature", "Armature", null],
    ["Hips", "Armature/Hips", "Armature"],
    ["Spine", "Armature/Hips/Spine", "Armature/Hips"],
    ["Head", "Armature/Hips/Spine/Head", "Armature/Hips/Spine"],
    ["LeftArm", "Armature/Hips/Spine/LeftArm", "Armature/Hips/Spine"],
    ["LeftForeArm", "Armature/Hips/Spine/LeftArm/LeftForeArm", "Armature/Hips/Spine/LeftArm"],
    ["LeftHand", "Armature/Hips/Spine/LeftArm/LeftForeArm/LeftHand", "Armature/Hips/Spine/LeftArm/LeftForeArm"],
    ["RightArm", "Armature/Hips/Spine/RightArm", "Armature/Hips/Spine"],
    ["RightForeArm", "Armature/Hips/Spine/RightArm/RightForeArm", "Armature/Hips/Spine/RightArm"],
    ["RightHand", "Armature/Hips/Spine/RightArm/RightForeArm/RightHand", "Armature/Hips/Spine/RightArm/RightForeArm"],
    ["LeftUpLeg", "Armature/Hips/LeftUpLeg", "Armature/Hips"],
    ["LeftLeg", "Armature/Hips/LeftUpLeg/LeftLeg", "Armature/Hips/LeftUpLeg"],
    ["LeftFoot", "Armature/Hips/LeftUpLeg/LeftLeg/LeftFoot", "Armature/Hips/LeftUpLeg/LeftLeg"],
    ["RightUpLeg", "Armature/Hips/RightUpLeg", "Armature/Hips"],
    ["RightLeg", "Armature/Hips/RightUpLeg/RightLeg", "Armature/Hips/RightUpLeg"],
    ["RightFoot", "Armature/Hips/RightUpLeg/RightLeg/RightFoot", "Armature/Hips/RightUpLeg/RightLeg"],
  ];
  return specs.map(([name, path, parentPath]) => ({
    id: boneId(`bone:${path}`),
    name,
    path,
    parentId: parentPath ? boneId(`bone:${parentPath}`) : null,
  }));
}
