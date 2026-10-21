import { describe, expect, it } from "vitest";
import {
  importedModelSubAssets,
  modelSubAssetKey,
  parseModelSubAssetKey,
} from "./model-subasset-catalog";

describe("imported model sub-asset catalog", () => {
  it("keeps importer ordering and local IDs intact", () => {
    const result = importedModelSubAssets({
      subAssets: [
        { localId: "material:skin", kind: "material", name: "Skin" },
        { localId: "main", kind: "model", name: "Hero" },
        { localId: "clip:Idle:abc", kind: "clip", name: "Idle", sourceIndex: 0 },
        { localId: "mesh:body", kind: "mesh", name: "Body" },
      ],
    });
    expect(result.map((entry) => entry.localId)).toEqual([
      "material:skin",
      "clip:Idle:abc",
      "mesh:body",
    ]);
  });

  it("round-trips filenames and colon-rich local IDs through selection keys", () => {
    const key = modelSubAssetKey("characters/Compound Character.fbx", "clip:Sway:8b32");
    expect(parseModelSubAssetKey(key)).toEqual({
      filename: "characters/Compound Character.fbx",
      localId: "clip:Sway:8b32",
    });
  });
});
