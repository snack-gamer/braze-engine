import { describe, expect, it } from "vitest";
import type { HumanBoneMapping, HumanoidBoneName } from "../domain/humanoid-avatar";
import { boneId, deriveSkeletonCompatibilitySignature, type BoneDefinition, type BoneId } from "../domain/skeleton";
import { buildHumanoidAvatarDefinition } from "./humanoid-avatar-builder";

const GUID = "0123456789abcdef0123456789abcdef";

describe("Humanoid Avatar builder", () => {
  it("derives a complete serializable Avatar and character scale", () => {
    const { skeleton, mapping } = fixture();
    const avatar = buildHumanoidAvatarDefinition({
      name: "Hero",
      sourceRef: { guid: GUID, localId: "avatar:hero" },
      skeletonRef: { guid: GUID, localId: "skeleton:hero" },
      skeleton,
      mapping,
    });

    expect(avatar.validation.status).toBe("valid");
    expect(avatar.humanScale).toBeCloseTo(2, 6);
    expect(avatar.referencePose.bones.hips).toEqual(skeleton.bones.find((bone) => bone.id === mapping.hips)?.bindLocal);
    expect(avatar.id).toBe(`${GUID}:avatar:hero:avatar`);
    expect(avatar.revision).toMatch(/^avatar-v1-[a-f0-9]{8}$/);
  });

  it("is deterministic and repairs parallel forward/up axes", () => {
    const { skeleton, mapping } = fixture();
    const input = {
      name: "Hero",
      sourceRef: { guid: GUID },
      skeletonRef: { guid: GUID, localId: "skeleton:hero" },
      skeleton,
      mapping,
      forwardAxis: "+y" as const,
      upAxis: "-y" as const,
    };
    const first = buildHumanoidAvatarDefinition(input);
    const second = buildHumanoidAvatarDefinition(input);
    expect(second.revision).toBe(first.revision);
    expect([first.forwardAxis, first.upAxis]).toEqual(["+z", "+y"]);
  });
});

function fixture() {
  const specs: Array<[HumanoidBoneName | "root", HumanoidBoneName | "root" | null, [number, number, number]]> = [
    ["root", null, [0, 0, 0]],
    ["hips", "root", [0, 1, 0]],
    ["spine", "hips", [0, 0.5, 0]],
    ["head", "spine", [0, 0.5, 0]],
    ["leftUpperArm", "spine", [-0.3, 0.3, 0]],
    ["leftLowerArm", "leftUpperArm", [-0.35, 0, 0]],
    ["leftHand", "leftLowerArm", [-0.25, 0, 0]],
    ["rightUpperArm", "spine", [0.3, 0.3, 0]],
    ["rightLowerArm", "rightUpperArm", [0.35, 0, 0]],
    ["rightHand", "rightLowerArm", [0.25, 0, 0]],
    ["leftUpperLeg", "hips", [-0.15, -0.5, 0]],
    ["leftLowerLeg", "leftUpperLeg", [0, -0.4, 0]],
    ["leftFoot", "leftLowerLeg", [0, -0.1, 0]],
    ["rightUpperLeg", "hips", [0.15, -0.5, 0]],
    ["rightLowerLeg", "rightUpperLeg", [0, -0.4, 0]],
    ["rightFoot", "rightLowerLeg", [0, -0.1, 0]],
  ];
  const ids = new Map(specs.map(([slot]) => [slot, boneId(`bone:${slot}`)]));
  const bones: BoneDefinition[] = specs.map(([slot, parent, translation]) => ({
    id: ids.get(slot)!,
    name: slot,
    path: String(slot),
    parentId: parent ? ids.get(parent)! : null,
    bindLocal: { translation, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    inverseBindMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  }));
  const mapping: HumanBoneMapping = Object.fromEntries(
    specs.flatMap(([slot]) => slot === "root" ? [] : [[slot, ids.get(slot)!]]),
  );
  return {
    skeleton: {
      version: 1 as const,
      id: "hero:skeleton",
      name: "Hero Skeleton",
      rootBoneIds: [ids.get("root")!] as BoneId[],
      bones,
      compatibilitySignature: deriveSkeletonCompatibilitySignature(bones),
    },
    mapping,
  };
}
