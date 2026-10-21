import { describe, expect, it } from "vitest";
import { buildNonEmptyFolderSet, libraryAssetKind } from "./model";
import type { LibraryAsset } from "../../lib/asset-api";

const parentOf = (path: string): string => {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
};

describe("library asset classification", () => {
  it("keeps Input and unsupported assets out of model insertion", () => {
    expect(libraryAssetKind({ kind: "inputActionMap", filename: "Controls.braze-input.json" } as LibraryAsset)).toBe("inputActionMap");
    expect(libraryAssetKind({ filename: "unknown.json" } as LibraryAsset)).toBeUndefined();
    expect(libraryAssetKind({ kind: "inputActionMap", filename: "conflicting.glb" } as LibraryAsset)).toBe("inputActionMap");
    expect(libraryAssetKind({ filename: "legacy.glb" } as LibraryAsset)).toBe("model");
  });
});

describe("buildNonEmptyFolderSet", () => {
  it("fills folders that contain children or assets, including their ancestors", () => {
    const result = buildNonEmptyFolderSet(
      ["3d", "3d/urban-pack", "3d/urban-pack/buildings", "empty"],
      ["3d/urban-pack/buildings", ""],
      parentOf,
    );

    expect([...result]).toEqual(expect.arrayContaining(["", "3d", "3d/urban-pack", "3d/urban-pack/buildings"]));
    expect(result.has("empty")).toBe(false);
  });
});
