import { describe, expect, it } from "vitest";
import {
  projectAssetFolderState,
  type AssetFolderProjectState,
} from "../project/persistence/asset-folder-project-section";

const fallback: AssetFolderProjectState = {
  folders: ["recovery"],
  itemFolders: {},
  itemNames: {},
};

describe("project asset-folder section decoding", () => {
  it("rejects nested shapes that would otherwise be normalized and written back lossily", () => {
    expect(() => projectAssetFolderState({ assets: { folders: "models" as never } }, fallback))
      .toThrow(/folders must be an array of strings/);
    expect(() => projectAssetFolderState({
      assets: { folders: [], itemFolders: { "model:a": 42 as never } },
    }, fallback)).toThrow(/itemFolders\.model:a must be a string/);
    expect(() => projectAssetFolderState({
      assets: { folders: [], itemNames: [] as never },
    }, fallback)).toThrow(/itemNames must be an object/);
  });

  it("retains folders referenced by canonical item assignments", () => {
    expect(projectAssetFolderState({
      assets: {
        folders: [],
        itemFolders: {
          "material:a": "looks/metal",
          "animatorController:hero": "characters/player",
          "avatarMask:upper": "characters/player",
        },
      },
    }, fallback)).toEqual({
      folders: ["characters", "characters/player", "looks", "looks/metal"],
      itemFolders: {
        "material:a": "looks/metal",
        "animatorController:hero": "characters/player",
        "avatarMask:upper": "characters/player",
      },
      itemNames: {},
    });
  });

  it("uses browser recovery only when the canonical section is absent", () => {
    expect(projectAssetFolderState({}, fallback)).toBe(fallback);
  });
});
