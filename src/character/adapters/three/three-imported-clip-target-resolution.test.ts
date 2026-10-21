import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { LibraryAsset, ModelImportDocument } from "../../../lib/asset-api";
import { defaultModelImportSettings } from "../../../lib/model-import-settings";
import { applyAnimationClipLoopPose } from "../../../three/animation-clip-loop-pose";
import {
  DEFAULT_HUMANOID_POSE_TUNING,
  REQUIRED_HUMANOID_BONES,
  type HumanBoneMapping,
} from "../../domain/humanoid-avatar";
import { buildThreePlaybackAvatar } from "./three-animator-imported-assets";
import { resolveThreeImportedClipForTarget } from "./three-imported-clip-target-resolution";
import {
  clearThreeRetargetedClipCacheForTests,
  threeRetargetedClipCacheSize,
} from "./three-retargeted-clip-cache";

const SOURCE_GUID = "a".repeat(32);
const TARGET_GUID = "b".repeat(32);

describe("Three imported Clip target resolution", () => {
  it("binds a same-model clip directly to the target without requiring an Avatar", () => {
    const asset = modelAsset(TARGET_GUID, "hero.glb", true);
    const root = new THREE.Group();
    const clip = new THREE.AnimationClip("Take", 2, []);
    const imported = importDocument(asset);

    const resolved = resolveThreeImportedClipForTarget({
      clipReference: { guid: TARGET_GUID, localId: "clip:take" },
      sourceAsset: asset,
      sourceRoot: root,
      sourceAnimations: [clip],
      sourceImport: imported,
      targetAsset: asset,
      targetRoot: root,
      targetImport: imported,
      importedAssets: [asset],
    });

    expect(resolved.value?.resource.bindings).toEqual([{ root, clip }]);
    expect(resolved.value?.metadata.durationSeconds).toBe(2);
  });

  it("binds an external Generic clip to an exactly compatible target skeleton", () => {
    const sourceAsset = modelAsset(SOURCE_GUID, "motions.glb", true);
    const targetAsset = modelAsset(TARGET_GUID, "hero.glb", false);
    const source = createRig();
    const target = createRig();
    const sourceImport = importDocument(sourceAsset);
    const targetImport = importDocument(targetAsset);
    const targetAvatar = buildThreePlaybackAvatar(
      { guid: TARGET_GUID, localId: "avatar:main" },
      targetAsset,
      target.root,
      targetImport.settings,
      [sourceAsset, targetAsset],
    );
    expect(targetAvatar.value).not.toBeNull();
    const clip = new THREE.AnimationClip("Take", 1, [
      new THREE.VectorKeyframeTrack(
        ".bones[Hips].position",
        [0, 1],
        [0, 1, 0, 0, 1.5, 0],
      ),
    ]);

    const resolved = resolveThreeImportedClipForTarget({
      clipReference: { guid: SOURCE_GUID, localId: "clip:take" },
      sourceAsset,
      sourceRoot: source.root,
      sourceAnimations: [clip],
      sourceImport,
      targetAsset,
      targetRoot: target.root,
      targetImport,
      targetAvatar: targetAvatar.value!,
      importedAssets: [sourceAsset, targetAsset],
    });

    expect(resolved.value?.resource.bindings).toEqual([{ root: target.root, clip }]);
    expect(resolved.diagnostics.some((item) => item.severity === "error")).toBe(false);
  });

  it("rejects an external clip bound to more than one source Avatar", () => {
    const sourceAsset = modelAsset(SOURCE_GUID, "motions.glb", true);
    sourceAsset.subAssets = [
      ...(sourceAsset.subAssets ?? []),
      { localId: "avatar:other", kind: "avatar", name: "Other Avatar" },
    ].map((subAsset) => subAsset.localId === "clip:take" ? {
      ...subAsset,
      bindings: [{ avatarLocalIds: ["avatar:main", "avatar:other"] }],
    } : subAsset);
    const targetAsset = modelAsset(TARGET_GUID, "hero.glb", false);
    const source = createRig();
    const target = createRig();
    const sourceImport = importDocument(sourceAsset);
    const targetImport = importDocument(targetAsset);
    const targetAvatar = buildThreePlaybackAvatar(
      { guid: TARGET_GUID, localId: "avatar:main" },
      targetAsset,
      target.root,
      targetImport.settings,
      [sourceAsset, targetAsset],
    ).value!;

    const resolved = resolveThreeImportedClipForTarget({
      clipReference: { guid: SOURCE_GUID, localId: "clip:take" },
      sourceAsset,
      sourceRoot: source.root,
      sourceAnimations: [new THREE.AnimationClip("Take", 1, [])],
      sourceImport,
      targetAsset,
      targetRoot: target.root,
      targetImport,
      targetAvatar,
      importedAssets: [sourceAsset, targetAsset],
    });

    expect(resolved.value).toBeNull();
    expect(resolved.diagnostics[0]?.code).toBe("ambiguous-source-avatar");
  });

  it("retargets an external Humanoid clip onto the selected target Avatar", () => {
    const sourceAsset = modelAsset(SOURCE_GUID, "motions.glb", true);
    const targetAsset = modelAsset(TARGET_GUID, "hero.glb", false);
    const source = createHumanoidRig();
    const target = createHumanoidRig();
    const sourceImport = humanoidImportDocument(sourceAsset, source.mapping);
    const targetImport = humanoidImportDocument(targetAsset, target.mapping);
    const targetAvatar = buildThreePlaybackAvatar(
      { guid: TARGET_GUID, localId: "avatar:main" },
      targetAsset,
      target.root,
      targetImport.settings,
      [sourceAsset, targetAsset],
    );
    expect(targetAvatar.value?.kind).toBe("humanoid");
    const clip = new THREE.AnimationClip("Take", 1, [
      new THREE.QuaternionKeyframeTrack(
        ".bones[Hips].quaternion",
        [0, 1],
        [0, 0, 0, 1, 0, Math.sin(0.2), 0, Math.cos(0.2)],
      ),
    ]);

    const resolved = resolveThreeImportedClipForTarget({
      clipReference: { guid: SOURCE_GUID, localId: "clip:take" },
      sourceAsset,
      sourceRoot: source.root,
      sourceAnimations: [clip],
      sourceImport,
      targetAsset,
      targetRoot: target.root,
      targetImport,
      targetAvatar: targetAvatar.value!,
      importedAssets: [sourceAsset, targetAsset],
    });

    expect(resolved.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    expect(resolved.value?.resource.bindings.length).toBeGreaterThan(0);
    expect(resolved.value?.resource.bindings.every((binding) => (
      binding.root === target.mesh
    ))).toBe(true);
  });

  it("separates conditioned-pose and root-motion-source Humanoid retarget bakes", () => {
    clearThreeRetargetedClipCacheForTests();
    try {
      const sourceAsset = modelAsset(SOURCE_GUID, "motions.glb", true);
      const targetAsset = modelAsset(TARGET_GUID, "hero.glb", false);
      const source = createHumanoidRig();
      const target = createHumanoidRig();
      const sourceImport = humanoidImportDocument(sourceAsset, source.mapping);
      const targetImport = humanoidImportDocument(targetAsset, target.mapping);
      const targetAvatar = buildThreePlaybackAvatar(
        { guid: TARGET_GUID, localId: "avatar:main" },
        targetAsset,
        target.root,
        targetImport.settings,
        [sourceAsset, targetAsset],
      ).value!;
      const clip = new THREE.AnimationClip("Take", 1, [
        new THREE.QuaternionKeyframeTrack(
          ".bones[Hips].quaternion",
          [0, 1],
          [0, 0, 0, 1, 0, Math.sin(0.2), 0, Math.cos(0.2)],
        ),
      ]);
      applyAnimationClipLoopPose(clip);
      const resolution = {
        clipReference: { guid: SOURCE_GUID, localId: "clip:take" },
        sourceAsset,
        sourceRoot: source.root,
        sourceAnimations: [clip],
        sourceImport,
        targetAsset,
        targetRoot: target.root,
        targetImport,
        targetAvatar,
        importedAssets: [sourceAsset, targetAsset],
      } as const;

      const conditioned = resolveThreeImportedClipForTarget(resolution);
      const rootMotion = resolveThreeImportedClipForTarget({
        ...resolution,
        playbackMode: "rootMotionExtraction",
      });

      expect(conditioned.value).not.toBeNull();
      expect(rootMotion.value).not.toBeNull();
      expect(threeRetargetedClipCacheSize()).toBe(2);
      expect(rootMotion.value?.resource.bindings[0]?.clip)
        .not.toBe(conditioned.value?.resource.bindings[0]?.clip);
    } finally {
      clearThreeRetargetedClipCacheForTests();
    }
  });
});

function modelAsset(guid: string, filename: string, includeClip: boolean): LibraryAsset {
  return {
    guid,
    name: filename,
    filename,
    path: `assets/${filename}`,
    url: `/3d-models/${filename}`,
    sizeBytes: 1,
    contentRevision: `${filename}-content-r1`,
    subAssets: [
      ...(includeClip ? [{
        localId: "clip:take",
        kind: "clip" as const,
        name: "Take",
        sourceIndex: 0,
      }] : []),
      { localId: "avatar:main", kind: "avatar", name: "Avatar" },
    ],
  };
}

function importDocument(asset: LibraryAsset): ModelImportDocument {
  return {
    version: "1",
    sourceFilename: asset.filename,
    settings: {
      ...defaultModelImportSettings,
      rig: {
        kind: "generic",
        importBlendShapes: true,
        maxBoneInfluences: 4,
        optimizeBones: false,
      },
    },
    revision: `${asset.filename}-metadata-r1`,
    updatedAt: null,
    importVersion: `${asset.filename}-import-r1`,
  };
}

function createRig(): Readonly<{ root: THREE.Group }> {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = "Hips";
  hips.position.set(0, 1, 0);
  const spine = new THREE.Bone();
  spine.name = "Spine";
  spine.position.set(0, 0.5, 0);
  hips.add(spine);
  root.add(hips);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 1, 0, 0], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([0.8, 0.2, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = "Body";
  mesh.bind(new THREE.Skeleton([hips, spine]));
  root.add(mesh);
  root.updateMatrixWorld(true);
  return { root };
}

function humanoidImportDocument(
  asset: LibraryAsset,
  humanBoneMapping: HumanBoneMapping,
): ModelImportDocument {
  const base = importDocument(asset);
  return {
    ...base,
    settings: {
      ...base.settings,
      rig: {
        kind: "humanoid",
        importBlendShapes: true,
        maxBoneInfluences: 4,
        optimizeBones: false,
        avatarSource: { kind: "createFromModel" },
        humanBoneMapping,
        humanoidTuning: DEFAULT_HUMANOID_POSE_TUNING,
      },
    },
  };
}

function createHumanoidRig(): Readonly<{
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  mapping: HumanBoneMapping;
}> {
  type RequiredBone = (typeof REQUIRED_HUMANOID_BONES)[number];
  const parents: Record<RequiredBone, RequiredBone | null> = {
    hips: null,
    spine: "hips",
    head: "spine",
    leftUpperArm: "spine",
    leftLowerArm: "leftUpperArm",
    leftHand: "leftLowerArm",
    rightUpperArm: "spine",
    rightLowerArm: "rightUpperArm",
    rightHand: "rightLowerArm",
    leftUpperLeg: "hips",
    leftLowerLeg: "leftUpperLeg",
    leftFoot: "leftLowerLeg",
    rightUpperLeg: "hips",
    rightLowerLeg: "rightUpperLeg",
    rightFoot: "rightLowerLeg",
  };
  const bones = new Map(REQUIRED_HUMANOID_BONES.map((slot) => {
    const bone = new THREE.Bone();
    bone.name = slot[0]!.toUpperCase() + slot.slice(1);
    bone.position.set(
      slot.startsWith("left") ? 0.3 : slot.startsWith("right") ? -0.3 : 0,
      slot.includes("Leg") || slot.includes("Foot") ? -0.4 : 0.4,
      slot.includes("Foot") ? 0.2 : 0,
    );
    return [slot, bone] as const;
  }));
  for (const [slot, bone] of bones) {
    const parent = parents[slot];
    if (parent) bones.get(parent)!.add(bone);
  }
  const root = new THREE.Group();
  root.add(bones.get("hips")!);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 1, 0, 0], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([0.8, 0.2, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = "Body";
  mesh.bind(new THREE.Skeleton([...bones.values()]));
  root.add(mesh);
  root.updateMatrixWorld(true);
  const pathFor = (slot: RequiredBone): string => {
    const parent = parents[slot];
    const name = bones.get(slot)!.name;
    return parent ? `${pathFor(parent)}/${name}` : name;
  };
  const mapping = Object.fromEntries(REQUIRED_HUMANOID_BONES.map((slot) => (
    [slot, `bone:${pathFor(slot)}`]
  ))) as HumanBoneMapping;
  return { root, mesh, mapping };
}
