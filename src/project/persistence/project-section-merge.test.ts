import { describe, expect, it } from "vitest";
import { mergeProjectSection } from "./project-section-merge";

describe("project section three-way merge", () => {
  it("merges independent material edits by stable material ID", () => {
    const base = [
      { id: "metal", roughness: 0.5, color: "gray" },
      { id: "wood", roughness: 0.8, color: "brown" },
    ];
    const result = mergeProjectSection(
      "materials",
      base,
      [base[0], { ...base[1], roughness: 0.9 }],
      [{ ...base[0], color: "silver" }, base[1]],
    );

    expect(result).toEqual({
      status: "merged",
      value: [
        { id: "metal", roughness: 0.5, color: "silver" },
        { id: "wood", roughness: 0.9, color: "brown" },
      ],
    });
  });

  it("reports the exact field when both editors change it differently", () => {
    const base = [{ id: "metal", roughness: 0.5 }];
    expect(mergeProjectSection(
      "materials",
      base,
      [{ id: "metal", roughness: 0.2 }],
      [{ id: "metal", roughness: 0.9 }],
    )).toEqual({ status: "conflict", paths: ["materials[metal].roughness"] });
  });

  it("merges asset folder membership and independent name assignments", () => {
    const result = mergeProjectSection(
      "assets",
      { folders: ["old"], itemNames: { "model:a": "A" } },
      { folders: ["old", "local"], itemNames: { "model:a": "A local" } },
      { folders: ["old", "remote"], itemNames: { "model:a": "A", "model:b": "B" } },
    );

    expect(result).toEqual({
      status: "merged",
      value: {
        folders: ["local", "old", "remote"],
        itemNames: { "model:a": "A local", "model:b": "B" },
      },
    });
  });

  it("keeps deletion safe when the other editor changed the deleted value", () => {
    expect(mergeProjectSection(
      "assets",
      { itemNames: { "model:a": "A" } },
      { itemNames: {} },
      { itemNames: { "model:a": "Remote rename" } },
    )).toEqual({ status: "conflict", paths: ["assets.itemNames.model:a"] });
  });

  it("merges independent character assets and nested controller records by stable ID", () => {
    const base = {
      version: "braze/character-assets-v1",
      animatorControllers: [{
        id: "controller-a",
        revision: "r1",
        name: "Locomotion",
        layers: [{ id: "base", name: "Base", weight: 1 }],
      }],
      avatarMasks: [{ id: "mask-a", revision: "r1", name: "Upper Body" }],
    };
    const result = mergeProjectSection(
      "characterAssets",
      base,
      {
        ...base,
        animatorControllers: [{
          ...base.animatorControllers[0],
          revision: "local-r2",
          layers: [{ id: "base", name: "Base", weight: 0.75 }],
        }],
      },
      {
        ...base,
        avatarMasks: [{ ...base.avatarMasks[0], revision: "remote-r2", name: "Arms Only" }],
      },
    );

    expect(result).toEqual({
      status: "merged",
      value: {
        version: "braze/character-assets-v1",
        animatorControllers: [{
          id: "controller-a",
          revision: "local-r2",
          name: "Locomotion",
          layers: [{ id: "base", name: "Base", weight: 0.75 }],
        }],
        avatarMasks: [{ id: "mask-a", revision: "remote-r2", name: "Arms Only" }],
      },
    });
  });

  it("reports the exact character asset field for overlapping edits", () => {
    const base = {
      animatorControllers: [{ id: "controller-a", revision: "r1", name: "Base" }],
      avatarMasks: [],
    };
    expect(mergeProjectSection(
      "characterAssets",
      base,
      { ...base, animatorControllers: [{ id: "controller-a", revision: "r2", name: "Local" }] },
      { ...base, animatorControllers: [{ id: "controller-a", revision: "r3", name: "Remote" }] },
    )).toEqual({
      status: "conflict",
      paths: ["characterAssets.animatorControllers[controller-a].name"],
    });
  });

  it("merges independent edits to one character asset with a fresh revision", () => {
    const base = {
      animatorControllers: [{
        id: "controller-a",
        revision: "r1",
        name: "Locomotion",
        layers: [{ id: "base", name: "Base", weight: 1 }],
      }],
      avatarMasks: [],
    };
    const result = mergeProjectSection(
      "characterAssets",
      base,
      {
        ...base,
        animatorControllers: [{
          ...base.animatorControllers[0],
          revision: "local-r2",
          layers: [{ id: "base", name: "Base", weight: 0.75 }],
        }],
      },
      {
        ...base,
        animatorControllers: [{
          ...base.animatorControllers[0],
          revision: "remote-r2",
          name: "Player Locomotion",
        }],
      },
    );

    expect(result).toEqual({
      status: "merged",
      value: {
        animatorControllers: [{
          id: "controller-a",
          revision: expect.stringMatching(/^character-revision-merge-[a-f0-9]{8}$/),
          name: "Player Locomotion",
          layers: [{ id: "base", name: "Base", weight: 0.75 }],
        }],
        avatarMasks: [],
      },
    });
  });

  it("preserves a unilateral character layer reorder beside a remote field edit", () => {
    const layers = [
      { id: "base", name: "Base", weight: 1 },
      { id: "upper", name: "Upper", weight: 0.5 },
      { id: "effects", name: "Effects", weight: 0.25 },
    ];
    const base = {
      animatorControllers: [{ id: "controller-a", revision: "r1", name: "Player", layers }],
      avatarMasks: [],
    };
    const result = mergeProjectSection(
      "characterAssets",
      base,
      {
        ...base,
        animatorControllers: [{
          ...base.animatorControllers[0],
          revision: "local-r2",
          layers: [layers[2], layers[0], layers[1]],
        }],
      },
      {
        ...base,
        animatorControllers: [{
          ...base.animatorControllers[0],
          revision: "remote-r2",
          name: "Hero",
        }],
      },
    );

    expect(result.status).toBe("merged");
    if (result.status === "merged") {
      const controllers = (result.value as typeof base).animatorControllers;
      expect(controllers[0]?.name).toBe("Hero");
      expect(controllers[0]?.layers.map((layer) => layer.id)).toEqual(["effects", "base", "upper"]);
    }
  });

  it("reports incompatible concurrent character ordering edits", () => {
    const layers = [
      { id: "base", name: "Base" },
      { id: "upper", name: "Upper" },
      { id: "effects", name: "Effects" },
    ];
    const base = {
      animatorControllers: [{ id: "controller-a", revision: "r1", layers }],
      avatarMasks: [],
    };
    expect(mergeProjectSection(
      "characterAssets",
      base,
      {
        ...base,
        animatorControllers: [{
          ...base.animatorControllers[0],
          revision: "local-r2",
          layers: [layers[1], layers[0], layers[2]],
        }],
      },
      {
        ...base,
        animatorControllers: [{
          ...base.animatorControllers[0],
          revision: "remote-r2",
          layers: [layers[0], layers[2], layers[1]],
        }],
      },
    )).toEqual({
      status: "conflict",
      paths: ["characterAssets.animatorControllers[controller-a].layers.$order"],
    });
  });
});
