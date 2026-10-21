import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "../../lib/asset-api";
import { REQUIRED_HUMANOID_BONES } from "../domain/humanoid-avatar";
import { defaultAnimatorForImportedModel } from "./imported-model-animator-default";

const GUID = "a".repeat(32);

function importedModel(patch: Partial<LibraryAsset> = {}): LibraryAsset {
  return {
    guid: GUID,
    name: "Hero.fbx",
    filename: "Hero.fbx",
    kind: "model",
    status: "ready",
    path: "assets/Hero.fbx",
    url: "/3d-models/Hero.fbx",
    sizeBytes: 1,
    subAssets: [{
      kind: "avatar",
      localId: "avatar:hero",
      name: "Hero Avatar",
      configuredRigKind: "generic",
      bones: [{ localId: "bone:Hips", name: "Hips", path: "Hips" }],
    }],
    ...patch,
  };
}

describe("imported model Animator defaults", () => {
  it("assigns the one configured model Avatar without choosing a Controller or Clip", () => {
    const animator = defaultAnimatorForImportedModel(importedModel());
    expect(animator).toMatchObject({
      enabled: true,
      avatarRef: { guid: GUID, localId: "avatar:hero" },
    });
    expect(animator?.controllerRef).toBeUndefined();
  });

  it("accepts analyzed assets with non-blocking warnings", () => {
    expect(defaultAnimatorForImportedModel(importedModel({ status: "dirty" })))
      .toBeDefined();
  });

  it("accepts a configured Humanoid only after every required role is mapped", () => {
    const avatar = importedModel().subAssets![0]!;
    const humanoid = {
      ...avatar,
      configuredRigKind: "humanoid",
      humanBoneMapping: Object.fromEntries(REQUIRED_HUMANOID_BONES.map((name) => [name, `bone:${name}`])),
    };
    expect(defaultAnimatorForImportedModel(importedModel({ subAssets: [humanoid] })))
      .toBeDefined();
    expect(defaultAnimatorForImportedModel(importedModel({
      subAssets: [{ ...humanoid, humanBoneMapping: { hips: "bone:hips" } }],
    }))).toBeUndefined();
  });

  it("does not guess when the rig is unconfigured, ambiguous, or failed", () => {
    const avatar = importedModel().subAssets![0]!;
    expect(defaultAnimatorForImportedModel(importedModel({
      subAssets: [{ ...avatar, configuredRigKind: undefined }],
    }))).toBeUndefined();
    expect(defaultAnimatorForImportedModel(importedModel({
      subAssets: [avatar, { ...avatar, localId: "avatar:other" }],
    }))).toBeUndefined();
    expect(defaultAnimatorForImportedModel(importedModel({ status: "failed" })))
      .toBeUndefined();
  });
});
