import { describe, expect, it } from "vitest";
import {
  formatAssetDependency,
  formatSubAssetCounts,
  summarizeLibraryAssetAnalysis,
} from "./asset-analysis";

describe("library asset analysis", () => {
  it("summarizes imported sub-assets and hides informational diagnostics", () => {
    const analysis = summarizeLibraryAssetAnalysis({
      subAssets: [
        { localId: "main", kind: "model", name: "Shop", sourceIndex: 0 },
        { localId: "mesh:body", kind: "mesh", name: "Body", sourceIndex: 0 },
        { localId: "material:atlas", kind: "material", name: "Atlas", sourceIndex: 0 },
        { localId: "clip:open", kind: "clip", name: "Open", sourceIndex: 0 },
        { localId: "entity:door", kind: "entity", name: "Door", objectId: "door" },
      ],
      dependencies: [{ kind: "texture", path: "textures/atlas.png" }],
      diagnostics: [
        { code: "meta-created", severity: "info", message: "Metadata created" },
        { code: "missing-texture", severity: "warning", message: "Texture is missing" },
        { code: "invalid-model", severity: "error", message: "Model is invalid" },
      ],
      foreignIds: { unityGuid: "unity-guid", assetStoreId: "123" },
    });

    expect(analysis.counts).toEqual({ mesh: 1, material: 1, avatar: 0, clip: 1 });
    expect(analysis.otherSubAssetCount).toBe(1);
    expect(formatSubAssetCounts(analysis)).toBe("1 mesh · 1 material · 1 clip · 1 other");
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.severity)).toEqual(["warning", "error"]);
    expect(analysis.foreignIds).toEqual([["assetStoreId", "123"], ["unityGuid", "unity-guid"]]);
  });

  it("formats path and GUID dependencies from the asset index", () => {
    expect(formatAssetDependency({ kind: "buffer", path: "models/shop.bin" })).toBe("models/shop.bin");
    expect(formatAssetDependency({
      kind: "asset",
      guid: "0123456789abcdef0123456789abcdef",
      localId: "main",
      objectId: "prefab-child",
    })).toBe("0123456789abcdef0123456789abcdef / main · prefab-child");
    expect(formatAssetDependency({ kind: "asset" })).toBe("Unresolved dependency");
  });

  it("uses author-facing plurals for content counts", () => {
    expect(formatSubAssetCounts({
      counts: { mesh: 3, material: 2, avatar: 0, clip: 4 },
      otherSubAssetCount: 0,
    })).toBe("3 meshes · 2 materials · 4 clips");
  });
});
