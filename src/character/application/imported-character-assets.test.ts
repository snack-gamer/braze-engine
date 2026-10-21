import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "../../lib/asset-api";
import {
  characterAssetOptionKey,
  characterAssetOptionReference,
  importedAvatarSkeletonReference,
  importedAnimationClipOptions,
  importedAvatarOptions,
  importedHumanoidMapping,
  importedHumanoidTuning,
  playableImportedAvatarOptions,
  resolveImportedCharacterSubAsset,
  reusableHumanoidAvatarOptions,
} from "./imported-character-assets";

const GUID = "a".repeat(32);
const MODELS: LibraryAsset[] = [{
  guid: GUID,
  name: "Hero",
  filename: "hero.glb",
  kind: "model",
  path: "assets/hero.glb",
  url: "/assets/hero.glb",
  sizeBytes: 42,
  subAssets: [
    { kind: "avatar", localId: "avatar:hero", name: "Hero Avatar" },
    {
      kind: "clip",
      localId: "clip:idle",
      name: "Idle",
      sourceIndex: 0,
      durationSeconds: 1.25,
      events: [{ id: "step", name: "Footstep", timeSeconds: 0.5, payload: {} }],
    },
    { kind: "mesh", localId: "mesh:body", name: "Body" },
  ],
}];

describe("imported character asset options", () => {
  it("exposes stable imported Avatar and clip references with readable labels", () => {
    expect(importedAvatarOptions(MODELS)).toEqual([{
      ref: { guid: GUID, localId: "avatar:hero" },
      label: "Hero Avatar — Hero",
      sourceName: "Hero",
      sourceFilename: "hero.glb",
    }]);
    expect(importedAnimationClipOptions(MODELS)).toEqual([{
      ref: { guid: GUID, localId: "clip:idle" },
      label: "Idle — Hero",
      sourceName: "Hero",
      sourceFilename: "hero.glb",
      sourceIndex: 0,
      sourceLooping: true,
      durationSeconds: 1.25,
      events: [{ id: "step", name: "Footstep", timeSeconds: 0.5, payload: {} }],
    }]);
  });

  it("round-trips option values without name-based lookup and rejects invalid model GUIDs", () => {
    const options = importedAnimationClipOptions(MODELS);
    const key = characterAssetOptionKey(options[0]?.ref);
    expect(characterAssetOptionReference(key, options)).toEqual({ guid: GUID, localId: "clip:idle" });
    expect(characterAssetOptionReference("missing", options)).toBeUndefined();
    expect(importedAvatarOptions([{ ...MODELS[0]!, guid: "not-a-guid" }])).toEqual([]);
    expect(resolveImportedCharacterSubAsset(MODELS, { guid: GUID, localId: "clip:idle" })?.subAsset.name)
      .toBe("Idle");
  });

  it("keeps disabled imported clip identities resolvable but out of assignment options", () => {
    const disabled = [{
      ...MODELS[0]!,
      subAssets: [{
        kind: "clip",
        localId: "clip:attack",
        name: "Attack",
        sourceIndex: 1,
        importEnabled: false,
      }],
    }];

    expect(importedAnimationClipOptions(disabled)).toEqual([]);
    expect(resolveImportedCharacterSubAsset(disabled, {
      guid: GUID,
      localId: "clip:attack",
    })?.subAsset.localId).toBe("clip:attack");
  });

  it("resolves an Avatar's exact Skeleton subasset and retains the legacy fallback", () => {
    const linked = {
      ...MODELS[0]!,
      subAssets: [
        { kind: "skeleton", localId: "skeleton:hero", name: "Hero Skeleton" },
        {
          kind: "avatar",
          localId: "avatar:hero",
          name: "Hero Avatar",
          skeletonLocalId: "skeleton:hero",
        },
      ],
    };
    const reference = { guid: GUID.toUpperCase(), localId: "avatar:hero" };

    expect(importedAvatarSkeletonReference(linked, reference)).toEqual({
      guid: GUID,
      localId: "skeleton:hero",
    });
    expect(importedAvatarSkeletonReference({
      ...linked,
      subAssets: linked.subAssets.filter((entry) => entry.kind !== "skeleton"),
    }, reference)).toBeUndefined();
    expect(importedAvatarSkeletonReference(MODELS[0]!, reference)).toEqual({
      guid: GUID,
      localId: "avatar:hero:skeleton",
    });
  });

  it("offers only configured, locally-authored, valid Humanoid Avatars as copy sources", () => {
    const required = [
      "hips", "spine", "head",
      "leftUpperArm", "leftLowerArm", "leftHand",
      "rightUpperArm", "rightLowerArm", "rightHand",
      "leftUpperLeg", "leftLowerLeg", "leftFoot",
      "rightUpperLeg", "rightLowerLeg", "rightFoot",
    ];
    const parents: Record<string, string | null> = {
      hips: null,
      spine: "hips",
      head: "spine",
      leftUpperArm: "spine", leftLowerArm: "leftUpperArm", leftHand: "leftLowerArm",
      rightUpperArm: "spine", rightLowerArm: "rightUpperArm", rightHand: "rightLowerArm",
      leftUpperLeg: "hips", leftLowerLeg: "leftUpperLeg", leftFoot: "leftLowerLeg",
      rightUpperLeg: "hips", rightLowerLeg: "rightUpperLeg", rightFoot: "rightLowerLeg",
    };
    const avatar = {
      kind: "avatar",
      localId: "avatar:configured",
      name: "Configured Avatar",
      configuredRigKind: "humanoid",
      configuredAvatarSource: "createFromModel",
      humanBoneMapping: Object.fromEntries(required.map((name) => [name, `bone:${name}`])),
      bones: required.map((name) => ({
        localId: `bone:${name}`,
        name,
        path: name,
        parentLocalId: parents[name] ? `bone:${parents[name]}` : null,
      })),
    };
    const options = reusableHumanoidAvatarOptions([{ ...MODELS[0]!, subAssets: [avatar] }]);
    expect(options).toHaveLength(1);
    expect(importedHumanoidMapping(avatar)).toMatchObject({
      hips: "bone:hips",
      leftHand: "bone:leftHand",
      rightFoot: "bone:rightFoot",
    });
    expect(importedHumanoidMapping({ ...avatar, kind: "mesh" })).toEqual({});
    expect(importedHumanoidTuning({
      ...avatar,
      humanoidTuning: { arm_stretch: 2, feet_spacing: -2, has_translation_dof: true },
    })).toMatchObject({ armStretch: 1, feetSpacing: -1, hasTranslationDof: true });
    expect(reusableHumanoidAvatarOptions([{
      ...MODELS[0]!,
      subAssets: [{ ...avatar, configuredAvatarSource: "copyFromAvatar" }],
    }])).toEqual([]);

    const semanticImporterIds = {
      ...avatar,
      humanBoneMapping: Object.fromEntries(required.map((name) => [name, `bone:Rig/${name}`])),
      bones: required.map((name, index) => ({
        localId: `bone:${name}:semantic-${index}`,
        name,
        path: `Rig/${name}`,
        parentLocalId: parents[name] === null
          ? null
          : `bone:${parents[name]}:semantic-${required.indexOf(parents[name]!)}`,
      })),
    };
    expect(reusableHumanoidAvatarOptions([{ ...MODELS[0]!, subAssets: [semanticImporterIds] }]))
      .toHaveLength(1);

    expect(playableImportedAvatarOptions([{
      ...MODELS[0]!,
      subAssets: [
        { ...semanticImporterIds, configuredAvatarSource: "copyFromAvatar" },
        { ...avatar, localId: "avatar:generic", configuredRigKind: "generic" },
        { ...avatar, localId: "avatar:unconfigured", configuredRigKind: undefined },
      ],
    }], GUID).map((option) => option.ref.localId)).toEqual([
      "avatar:configured",
      "avatar:generic",
    ]);
    expect(playableImportedAvatarOptions(MODELS, "b".repeat(32))).toEqual([]);
  });
});
