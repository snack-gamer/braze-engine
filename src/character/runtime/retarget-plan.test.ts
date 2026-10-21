import { describe, expect, it } from "vitest";
import type { AssetRef } from "../../assets/domain/asset-reference";
import {
  REQUIRED_HUMANOID_BONES,
  type HumanBoneMapping,
  type HumanoidAvatarDefinition,
  type HumanoidBoneName,
} from "../domain/humanoid-avatar";
import type { CharacterTransform } from "../domain/character-values";
import { boneId, type BoneDefinition, type BoneId, type SkeletonDefinition } from "../domain/skeleton";
import {
  inverseCharacterQuaternion,
  multiplyCharacterQuaternions,
  rotateCharacterVector,
  type CharacterQuaternion,
} from "./pose-math";
import { compileHumanoidRetargetPlan } from "./retarget-plan";

const SOURCE_GUID = "11111111111111111111111111111111";
const TARGET_GUID = "22222222222222222222222222222222";
const IDENTITY_MATRIX = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
] as const;

describe("Humanoid retarget plan", () => {
  it("compiles right-side offsets from global, non-commuting reference poses", () => {
    const sourceHips = axisAngle([1, 0, 0], 0.37);
    const sourceSpine = axisAngle([0, 1, 0], -0.29);
    const targetHips = axisAngle([0, 0, 1], 0.41);
    const targetSpine = axisAngle([1, 0, 0], -0.23);
    const source = fixture("source", SOURCE_GUID, { hips: sourceHips, spine: sourceSpine });
    const target = fixture("target", TARGET_GUID, { hips: targetHips, spine: targetSpine }, "+x");

    const result = compileHumanoidRetargetPlan(options(source, target));

    expect(result.diagnostics).toEqual([]);
    const axis = result.value!.rootAxisRotation;
    expectVector(rotateCharacterVector(axis, [0, 0, 1]), [1, 0, 0]);
    expectVector(rotateCharacterVector(axis, [0, 1, 0]), [0, 1, 0]);
    const sourceSpineGlobal = multiplyCharacterQuaternions(sourceHips, sourceSpine);
    const targetSpineGlobal = multiplyCharacterQuaternions(targetHips, targetSpine);
    const expected = multiplyCharacterQuaternions(
      inverseCharacterQuaternion(sourceSpineGlobal),
      multiplyCharacterQuaternions(inverseCharacterQuaternion(axis), targetSpineGlobal),
    );
    expectQuaternion(result.value!.bones.find((bone) => bone.humanBone === "spine")!
      .referenceRotationOffset, expected);

    const oldLocalLeftOffset = multiplyCharacterQuaternions(
      targetSpine,
      inverseCharacterQuaternion(sourceSpine),
    );
    expect(quaternionSimilarity(expected, oldLocalLeftOffset)).toBeLessThan(0.99);
  });

  it("keeps cache identity deterministic and includes derived axis, scale, and pose semantics", () => {
    const source = fixture("source", SOURCE_GUID, { hips: axisAngle([1, 0, 0], 0.2) });
    const target = fixture("target", TARGET_GUID, { hips: axisAngle([0, 0, 1], 0.3) }, "+x");
    const base = compileHumanoidRetargetPlan(options(source, target)).value!;
    const repeated = compileHumanoidRetargetPlan(options(source, target)).value!;
    const changedAxis = compileHumanoidRetargetPlan(options(source, {
      ...target,
      avatar: { ...target.avatar, forwardAxis: "-x" },
    })).value!;
    const changedScale = compileHumanoidRetargetPlan(options(source, {
      ...target,
      avatar: { ...target.avatar, humanScale: target.avatar.humanScale * 1.25 },
    })).value!;
    const changedPose = compileHumanoidRetargetPlan(options(source, {
      ...target,
      avatar: {
        ...target.avatar,
        referencePose: {
          space: "skeletonLocal",
          bones: {
            ...target.avatar.referencePose.bones,
            hips: transform(axisAngle([0, 0, 1], 0.5)),
          },
        },
      },
    })).value!;

    expect(repeated.cacheKey).toBe(base.cacheKey);
    expect(changedAxis.cacheKey).not.toBe(base.cacheKey);
    expect(changedScale.cacheKey).not.toBe(base.cacheKey);
    expect(changedPose.cacheKey).not.toBe(base.cacheKey);
    expect(base.cacheKey.length).toBeLessThan(8_192);
  });

  it("discovers named twist helpers and includes their distribution in cache identity", () => {
    const source = fixture("source", SOURCE_GUID, {});
    const target = fixture("target", TARGET_GUID, {});
    const upperId = target.avatar.mapping.leftUpperArm!;
    const lowerId = target.avatar.mapping.leftLowerArm!;
    const twistId = boneId("target:leftUpperArmTwist");
    const lower = target.skeleton.bones.find((bone) => bone.id === lowerId)!;
    target.skeleton.bones.splice(target.skeleton.bones.indexOf(lower), 1, {
      ...lower,
      parentId: twistId,
    }, {
      id: twistId,
      name: "LeftUpperArm_Twist",
      path: "target/leftUpperArm/LeftUpperArm_Twist",
      parentId: upperId,
      bindLocal: {
        translation: [0.4, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      inverseBindMatrix: [...IDENTITY_MATRIX],
    });

    const compiled = compileHumanoidRetargetPlan(options(source, target)).value!;
    expect(compiled.twistChains).toEqual([expect.objectContaining({
      humanBone: "leftUpperArm",
      targetChildHumanBone: "leftLowerArm",
      distribution: 0.5,
      axis: [1, 0, 0],
      helperBones: [expect.objectContaining({ targetBoneName: "LeftUpperArm_Twist" })],
    })]);

    const changed = compileHumanoidRetargetPlan(options(source, {
      ...target,
      avatar: {
        ...target.avatar,
        tuning: { ...target.avatar.tuning, upperArmTwist: 0.8 },
      },
    })).value!;
    expect(changed.cacheKey).not.toBe(compiled.cacheKey);
  });
});

type Fixture = Readonly<{
  skeleton: SkeletonDefinition;
  avatar: HumanoidAvatarDefinition;
}>;

function fixture(
  label: string,
  guid: string,
  rotations: Partial<Record<HumanoidBoneName, CharacterQuaternion>>,
  forwardAxis: HumanoidAvatarDefinition["forwardAxis"] = "+z",
): Fixture {
  const ids = new Map(REQUIRED_HUMANOID_BONES.map((slot) => [slot, boneId(`${label}:${slot}`)]));
  const mapping = Object.fromEntries(
    REQUIRED_HUMANOID_BONES.map((slot) => [slot, ids.get(slot)!]),
  ) as HumanBoneMapping;
  const bones: BoneDefinition[] = REQUIRED_HUMANOID_BONES.map((slot) => {
    const parent = slot === "hips" ? null : slot === "spine" ? "hips" : slot === "head" ? "spine" : "hips";
    return {
      id: ids.get(slot)!,
      name: `${label}-${slot}`,
      path: `${label}/${slot}`,
      parentId: parent ? ids.get(parent)! : null,
      bindLocal: transform(rotations[slot] ?? [0, 0, 0, 1]),
      inverseBindMatrix: [...IDENTITY_MATRIX],
    };
  });
  const sourceRef: AssetRef = { guid, localId: `avatar:${label}` };
  const skeletonRef: AssetRef = { guid, localId: `skeleton:${label}` };
  const skeleton: SkeletonDefinition = {
    version: 1,
    id: `${label}:skeleton`,
    name: `${label} skeleton`,
    rootBoneIds: [ids.get("hips")!] as BoneId[],
    bones,
    compatibilitySignature: `${label}-signature`,
  };
  return {
    skeleton,
    avatar: {
      version: 1,
      id: `${label}:avatar`,
      name: `${label} avatar`,
      revision: `${label}-revision`,
      sourceRef,
      skeletonRef,
      mapping,
      referencePose: {
        space: "skeletonLocal",
        bones: Object.fromEntries(REQUIRED_HUMANOID_BONES.map((slot) => [
          slot,
          transform(rotations[slot] ?? [0, 0, 0, 1]),
        ])),
      },
      humanScale: label === "source" ? 1.8 : 2.1,
      forwardAxis,
      upAxis: "+y",
      tuning: {
        armStretch: 0.05,
        legStretch: 0.05,
        upperArmTwist: 0.5,
        lowerArmTwist: 0.5,
        upperLegTwist: 0.5,
        lowerLegTwist: 0.5,
        feetSpacing: 0,
        hasTranslationDof: false,
      },
      validation: { status: "valid", issues: [] },
    },
  };
}

function options(source: Fixture, target: Fixture) {
  return {
    sourceSkeleton: source.skeleton,
    targetSkeleton: target.skeleton,
    sourceAvatar: source.avatar,
    targetAvatar: target.avatar,
    cacheIdentity: {
      sourceClipRevision: "clip-revision",
      sourceSkeletonRevision: source.skeleton.compatibilitySignature,
      sourceAvatarRevision: source.avatar.revision,
      targetSkeletonRevision: target.skeleton.compatibilitySignature,
      targetAvatarRevision: target.avatar.revision,
      settingsRevision: "settings-revision",
    },
  };
}

function transform(rotation: CharacterQuaternion): CharacterTransform {
  return { translation: [0, 0, 0], rotation: [...rotation], scale: [1, 1, 1] };
}

function axisAngle(axis: readonly [number, number, number], angle: number): CharacterQuaternion {
  const half = angle / 2;
  const sine = Math.sin(half);
  return [axis[0] * sine, axis[1] * sine, axis[2] * sine, Math.cos(half)];
}

function quaternionSimilarity(left: CharacterQuaternion, right: CharacterQuaternion): number {
  return Math.abs(left.reduce((sum, component, index) => sum + component * right[index]!, 0));
}

function expectQuaternion(actual: CharacterQuaternion, expected: CharacterQuaternion): void {
  expect(quaternionSimilarity(actual, expected)).toBeCloseTo(1, 8);
}

function expectVector(actual: readonly number[], expected: readonly number[]): void {
  actual.forEach((component, index) => expect(component).toBeCloseTo(expected[index]!, 8));
}
