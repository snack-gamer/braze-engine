import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { AnimatorPlaybackAvatar } from "../../application/playback/animator-playback-contracts";
import type { AvatarMaskAsset } from "../../domain/avatar-mask";
import { boneId, type BoneDefinition } from "../../domain/skeleton";
import { createThreeAvatarMaskTrackFilter } from "./three-avatar-mask";

describe("Three Avatar Mask track filter", () => {
  it("keeps humanoid regions independent even when they share an active ancestor", () => {
    const fixture = humanoidFixture();
    const mask = avatarMask({ head: false });
    const allowed = createThreeAvatarMaskTrackFilter(fixture.body, mask, fixture.avatar);

    expect(allowed(track("Spine.position"))).toBe(true);
    expect(allowed(track("Head.position"))).toBe(false);
  });

  it("uses the nearest Generic transform rule and honors inactive branches", () => {
    const fixture = humanoidFixture();
    const generic: AnimatorPlaybackAvatar = {
      id: "model:avatar",
      kind: "generic",
      skeleton: fixture.avatar.skeleton,
    };
    const mask = avatarMask({}, [
      { path: "Hips", active: false },
      { path: "Hips/Spine/Head", active: true },
    ]);
    const allowed = createThreeAvatarMaskTrackFilter(fixture.body, mask, generic);

    expect(allowed(track("Spine.position"))).toBe(false);
    expect(allowed(track("Head.position"))).toBe(true);
  });

  it("resolves durable bone identity before a stale readable path", () => {
    const fixture = humanoidFixture();
    const generic: AnimatorPlaybackAvatar = {
      id: "model:avatar",
      kind: "generic",
      skeleton: fixture.avatar.skeleton,
    };
    const mask = avatarMask({}, [{
      boneId: boneId("bone:Head"),
      path: "Old/Head/Path",
      active: true,
    }]);
    const allowed = createThreeAvatarMaskTrackFilter(fixture.body, mask, generic);

    expect(allowed(track("Head.position"))).toBe(true);
    expect(allowed(track("Spine.position"))).toBe(false);
  });
});

function humanoidFixture() {
  const body = new THREE.Group();
  const hips = namedBone("Hips");
  const spine = namedBone("Spine");
  const head = namedBone("Head");
  body.add(hips);
  hips.add(spine);
  spine.add(head);
  const bones: BoneDefinition[] = [
    skeletonBone("Hips", "Hips", null),
    skeletonBone("Spine", "Hips/Spine", "Hips"),
    skeletonBone("Head", "Hips/Spine/Head", "Spine"),
  ];
  const avatar: AnimatorPlaybackAvatar = {
    id: "model:avatar",
    kind: "humanoid",
    skeleton: {
      version: 1,
      id: "skeleton",
      name: "Skeleton",
      rootBoneIds: [boneId("bone:Hips")],
      compatibilitySignature: "signature",
      bones,
    },
    definition: {
      version: 1,
      id: "avatar",
      name: "Avatar",
      revision: "r1",
      sourceRef: { guid: "a".repeat(32), localId: "main" },
      skeletonRef: { guid: "a".repeat(32), localId: "skeleton" },
      mapping: {
        hips: boneId("bone:Hips"),
        spine: boneId("bone:Spine"),
        head: boneId("bone:Head"),
      },
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
  return { body, avatar };
}

function namedBone(name: string): THREE.Bone {
  const value = new THREE.Bone();
  value.name = name;
  return value;
}

function skeletonBone(name: string, path: string, parent: string | null): BoneDefinition {
  return {
    id: boneId(`bone:${name}`),
    name,
    path,
    parentId: parent ? boneId(`bone:${parent}`) : null,
    bindLocal: {
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
    inverseBindMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  };
}

function avatarMask(
  humanoidBodyParts: AvatarMaskAsset["humanoidBodyParts"],
  transforms: AvatarMaskAsset["transforms"] = [],
): AvatarMaskAsset {
  return {
    version: 1,
    id: "mask",
    name: "Mask",
    humanoidBodyParts,
    transforms,
  };
}

function track(name: string): THREE.VectorKeyframeTrack {
  return new THREE.VectorKeyframeTrack(name, [0, 1], [0, 0, 0, 1, 1, 1]);
}
