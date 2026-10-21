import { describe, expect, it } from "vitest";
import {
  characterAssetReference,
  createEmptyCharacterAssetLibrary,
} from "../domain/character-asset-library";
import {
  CharacterAssetRevisionConflictError,
  createAnimatorControllerAsset,
  createAnimatorControllerAssetFromClips,
  createAvatarMaskAsset,
  duplicateAnimatorControllerAsset,
  duplicateAvatarMaskAsset,
  removeAnimatorControllerAsset,
  resolveCharacterAssetReference,
  updateAnimatorControllerAsset,
  updateAvatarMaskAsset,
} from "./character-asset-library";

const CONTROLLER_ID = "a".repeat(32);
const MASK_ID = "b".repeat(32);

describe("authored character asset operations", () => {
  it("creates stable AssetRef-compatible identities without mutating the source library", () => {
    const empty = createEmptyCharacterAssetLibrary();
    const created = createAnimatorControllerAsset(empty, "Locomotion", {
      id: CONTROLLER_ID,
      revision: "controller-r1",
    });

    expect(empty.animatorControllers).toEqual([]);
    expect(created.asset).toMatchObject({
      id: CONTROLLER_ID,
      revision: "controller-r1",
      name: "Locomotion",
    });
    expect(characterAssetReference(created.asset)).toEqual({ guid: CONTROLLER_ID, localId: "main" });
    expect(resolveCharacterAssetReference(created.library, { guid: CONTROLLER_ID, localId: "main" }))
      .toEqual({ kind: "animatorController", asset: created.asset });
    expect(resolveCharacterAssetReference(created.library, {
      guid: CONTROLLER_ID,
      localId: "clip:Run",
    })).toBeUndefined();
  });

  it("updates by expected revision and leaves prior nested state untouched", () => {
    const created = createAnimatorControllerAsset(createEmptyCharacterAssetLibrary(), "Base", {
      id: CONTROLLER_ID,
      revision: "r1",
    });
    const originalLayer = created.asset.layers[0]!;
    const updated = updateAnimatorControllerAsset(
      created.library,
      CONTROLLER_ID,
      "r1",
      { name: "Gameplay", layers: [{ ...originalLayer, weight: 0.75 }] },
      "r2",
    );

    expect(created.asset).toMatchObject({ name: "Base", revision: "r1" });
    expect(created.asset.layers[0]?.weight).toBe(1);
    expect(updated.asset).toMatchObject({ id: CONTROLLER_ID, name: "Gameplay", revision: "r2" });
    expect(() => updateAnimatorControllerAsset(
      updated.library,
      CONTROLLER_ID,
      "r1",
      { name: "Stale edit" },
      "r3",
    )).toThrowError(CharacterAssetRevisionConflictError);
    expect(() => removeAnimatorControllerAsset(updated.library, CONTROLLER_ID, "r1"))
      .toThrowError(CharacterAssetRevisionConflictError);
    expect(removeAnimatorControllerAsset(updated.library, CONTROLLER_ID, "r2").animatorControllers)
      .toEqual([]);
  });

  it("creates and updates Avatar Masks through the same immutable revision contract", () => {
    const created = createAvatarMaskAsset(createEmptyCharacterAssetLibrary(), "Upper Body", {
      id: MASK_ID,
      revision: "mask-r1",
    });
    const updated = updateAvatarMaskAsset(
      created.library,
      MASK_ID,
      "mask-r1",
      { humanoidBodyParts: { body: true, leftArm: true, rightArm: true } },
      "mask-r2",
    );
    expect(created.asset.humanoidBodyParts).toEqual({});
    expect(updated.asset).toMatchObject({
      id: MASK_ID,
      revision: "mask-r2",
      humanoidBodyParts: { body: true, leftArm: true, rightArm: true },
    });
    expect(resolveCharacterAssetReference(updated.library, { guid: MASK_ID }))
      .toEqual({ kind: "avatarMask", asset: updated.asset });
  });

  it("creates a playable default-state controller from imported clips in one mutation", () => {
    const created = createAnimatorControllerAssetFromClips(
      createEmptyCharacterAssetLibrary(),
      [
        { name: "Idle", ref: { guid: "1".repeat(32), localId: "clip:idle" } },
        { name: "Idle", ref: { guid: "1".repeat(32), localId: "clip:walk" } },
      ],
      "Hero",
      { id: CONTROLLER_ID, revision: "controller-r1" },
    );

    const layer = created.asset.layers[0]!;
    expect(layer.states.map((state) => state.name)).toEqual(["Idle", "Idle 2"]);
    expect(layer.defaultStateId).toBe(layer.states[0]?.id);
    expect(layer.states.map((state) => state.motion)).toEqual([
      { kind: "clip", clipRef: { guid: "1".repeat(32), localId: "clip:idle" }, speed: 1 },
      { kind: "clip", clipRef: { guid: "1".repeat(32), localId: "clip:walk" }, speed: 1 },
    ]);
    expect(created.library.animatorControllers).toEqual([created.asset]);
  });

  it("duplicates controller and mask documents under new project identities", () => {
    const controller = createAnimatorControllerAsset(createEmptyCharacterAssetLibrary(), "Hero", {
      id: CONTROLLER_ID,
      revision: "controller-r1",
    });
    const controllerCopy = duplicateAnimatorControllerAsset(
      controller.library,
      CONTROLLER_ID,
      "controller-r1",
      { id: "c".repeat(32), revision: "controller-copy-r1" },
    );
    const mask = createAvatarMaskAsset(controllerCopy.library, "Upper Body", {
      id: MASK_ID,
      revision: "mask-r1",
    });
    const maskCopy = duplicateAvatarMaskAsset(mask.library, MASK_ID, "mask-r1", {
      id: "d".repeat(32),
      revision: "mask-copy-r1",
    });

    expect(controllerCopy.asset).toMatchObject({ id: "c".repeat(32), name: "Hero Copy" });
    expect(controllerCopy.asset.layers).not.toBe(controller.asset.layers);
    expect(maskCopy.asset).toMatchObject({ id: "d".repeat(32), name: "Upper Body Copy" });
    expect(maskCopy.library.avatarMasks).toHaveLength(2);
  });
});
