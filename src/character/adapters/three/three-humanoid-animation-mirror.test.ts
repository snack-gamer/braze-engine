import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { AnimatorPlaybackAvatar } from "../../application/playback/animator-playback-contracts";
import { boneId } from "../../domain/skeleton";
import { mirrorThreeHumanoidTracks } from "./three-humanoid-animation-mirror";

describe("Humanoid animation mirroring", () => {
  it("swaps semantic sides and reflects positions and rotations", () => {
    const mirrored = mirrorThreeHumanoidTracks([
      new THREE.VectorKeyframeTrack("LeftHand.position", [0], [2, 3, 4]),
      new THREE.QuaternionKeyframeTrack("LeftHand.quaternion", [0], [0.1, 0.2, 0.3, 0.9]),
    ], avatar());

    expect(mirrored.diagnostics).toEqual([]);
    expect(mirrored.value?.map((track) => track.name)).toEqual([
      "RightHand.position",
      "RightHand.quaternion",
    ]);
    expect([...mirrored.value![0]!.values]).toEqual([-2, 3, 4]);
    [...mirrored.value![1]!.values].forEach((value, index) => {
      expect(value).toBeCloseTo([0.1, -0.2, -0.3, 0.9][index]!, 6);
    });
  });

  it("requires humanoid semantics instead of guessing names", () => {
    const result = mirrorThreeHumanoidTracks([], undefined);
    expect(result.value).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("humanoid-mirror-avatar-required");
  });
});

function avatar(): AnimatorPlaybackAvatar {
  const left = boneId("left");
  const right = boneId("right");
  const skeleton = {
    version: 1 as const,
    id: "skeleton",
    name: "Skeleton",
    rootBoneIds: [left, right],
    compatibilitySignature: "signature",
    bones: [left, right].map((id, index) => ({
      id,
      name: index === 0 ? "LeftHand" : "RightHand",
      path: index === 0 ? "LeftHand" : "RightHand",
      parentId: null,
      bindLocal: {
        translation: [0, 0, 0] as [number, number, number],
        rotation: [0, 0, 0, 1] as [number, number, number, number],
        scale: [1, 1, 1] as [number, number, number],
      },
      inverseBindMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1] as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number],
    })),
  };
  return {
    id: "avatar",
    kind: "humanoid",
    skeleton,
    definition: {
      version: 1,
      id: "avatar",
      name: "Avatar",
      revision: "r1",
      sourceRef: { guid: "a".repeat(32), localId: "avatar" },
      skeletonRef: { guid: "a".repeat(32), localId: "skeleton" },
      mapping: { leftHand: left, rightHand: right },
      referencePose: { space: "skeletonLocal", bones: {} },
      humanScale: 1,
      forwardAxis: "+z",
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
