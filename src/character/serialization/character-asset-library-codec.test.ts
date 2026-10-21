import { describe, expect, it } from "vitest";
import { createEmptyCharacterAssetLibrary } from "../domain/character-asset-library";
import { CharacterCodecError } from "./character-codec-values";
import {
  decodeCharacterAssetLibrary,
  encodeCharacterAssetLibrary,
} from "./character-asset-library-codec";
import { characterAssetLibraryFromProject } from "./character-asset-project-section";

describe("character asset library codec", () => {
  it("deterministically migrates legacy aliases and preserves unknown fields", () => {
    const legacy = {
      animator_controllers: [{
        id: "controller:locomotion",
        name: "Locomotion",
        parameters: [],
        layers: [],
        graphViewport: { x: 14, y: 20 },
      }],
      avatar_masks: [{
        name: "Upper Body",
        humanoid_body_parts: { body: true },
        transforms: [],
        editorColor: "blue",
      }],
      futureLibraryMetadata: { retained: true },
    };

    const first = decodeCharacterAssetLibrary(legacy);
    const second = decodeCharacterAssetLibrary(legacy);
    expect(first).toEqual(second);
    expect(first.animatorControllers[0]).toMatchObject({
      id: expect.stringMatching(/^[a-f0-9]{32}$/),
      revision: expect.stringMatching(/^character-revision-/),
      extensions: { graphViewport: { x: 14, y: 20 } },
    });
    expect(first.avatarMasks[0]).toMatchObject({
      id: expect.stringMatching(/^[a-f0-9]{32}$/),
      revision: expect.stringMatching(/^character-revision-/),
      extensions: { editorColor: "blue" },
    });
    expect(first.extensions).toEqual({ futureLibraryMetadata: { retained: true } });

    const encoded = encodeCharacterAssetLibrary(first);
    expect(encoded).toMatchObject({
      version: "braze/character-assets-v1",
      futureLibraryMetadata: { retained: true },
      animatorControllers: [{ graphViewport: { x: 14, y: 20 } }],
      avatarMasks: [{ editorColor: "blue" }],
    });
    expect(decodeCharacterAssetLibrary(encoded)).toEqual(first);
    expect(encoded).not.toHaveProperty("skeletons");
    expect(encoded).not.toHaveProperty("animationClips");
  });

  it("keeps migrated asset identities stable when legacy arrays are reordered", () => {
    const legacy = {
      controllers: [
        { id: "legacy:walk", name: "Walk", parameters: [], layers: [] },
        { id: "legacy:combat", name: "Combat", parameters: [], layers: [] },
      ],
      masks: [
        { name: "Hands", transforms: [], humanoidBodyParts: {} },
        { name: "Feet", transforms: [], humanoidBodyParts: {} },
      ],
    };
    const identityByName = (value: typeof legacy) => {
      const decoded = decodeCharacterAssetLibrary(value);
      return Object.fromEntries(
        [...decoded.animatorControllers, ...decoded.avatarMasks]
          .map((asset) => [asset.name, { id: asset.id, revision: asset.revision }]),
      );
    };

    expect(identityByName({
      controllers: [...legacy.controllers].reverse(),
      masks: [...legacy.masks].reverse(),
    })).toEqual(identityByName(legacy));
  });

  it("rejects malformed canonical identities, duplicate GUIDs, and future versions", () => {
    expect(() => decodeCharacterAssetLibrary({
      version: "braze/character-assets-v1",
      animatorControllers: [{ id: "not-a-guid", name: "Bad", revision: "r1" }],
      avatarMasks: [],
    })).toThrowError(CharacterCodecError);

    const guid = "a".repeat(32);
    expect(() => decodeCharacterAssetLibrary({
      version: "braze/character-assets-v1",
      animatorControllers: [{ id: guid, name: "Controller", revision: "r1" }],
      avatarMasks: [{ id: guid, name: "Mask", revision: "r1" }],
    })).toThrow(/duplicate asset id/);
    expect(() => decodeCharacterAssetLibrary({ version: "braze/character-assets-v99" }))
      .toThrowError(CharacterCodecError);
    expect(() => decodeCharacterAssetLibrary({
      version: 1,
      animatorControllers: [{ id: "legacy-id", name: "Not canonical", revision: "r1" }],
    })).toThrowError(CharacterCodecError);
  });

  it("reads legacy project-root aliases without replacing unrelated project data", () => {
    const library = characterAssetLibraryFromProject({
      materials: [{ id: "material" }],
      animatorControllers: [{ id: "legacy-controller", name: "Legacy" }],
      unknownProjectSection: { retained: true },
    });
    expect(library.animatorControllers).toHaveLength(1);
    expect(library.avatarMasks).toEqual([]);

    const fallback = createEmptyCharacterAssetLibrary();
    expect(characterAssetLibraryFromProject({ materials: [] }, fallback)).toBe(fallback);
  });
});
