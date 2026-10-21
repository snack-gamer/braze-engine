import { describe, expect, it } from "vitest";
import { decodeModelSubAssetPreviewTarget } from "./model-subasset-preview-target";

describe("model subasset preview target decoding", () => {
  it("validates mesh and clip source metadata without coercing importer values", () => {
    expect(decodeModelSubAssetPreviewTarget({
      localId: "mesh:4",
      kind: "mesh",
      name: "Body",
      sourceIndex: 4,
      nodePath: "  Armature/Body  ",
    })).toEqual({
      localId: "mesh:4",
      kind: "mesh",
      name: "Body",
      sourceIndex: 4,
      nodePath: "Armature/Body",
    });

    expect(decodeModelSubAssetPreviewTarget({
      localId: "clip:invalid",
      kind: "clip",
      name: "Idle",
      sourceIndex: "0" as unknown as number,
    })).toEqual({
      localId: "clip:invalid",
      kind: "clip",
      name: "Idle",
      sourceIndex: null,
      runtimeClipIndex: null,
    });

    expect(decodeModelSubAssetPreviewTarget({
      localId: "clip:segment",
      kind: "clip",
      name: "Attack",
      sourceIndex: 0,
      runtimeClipIndex: 3,
    })).toMatchObject({ sourceIndex: 0, runtimeClipIndex: 3 });
  });

  it("keeps only well-formed material bindings", () => {
    expect(decodeModelSubAssetPreviewTarget({
      localId: "material:2",
      kind: "material",
      name: "Cloth",
      sourceIndex: 2,
      bindings: [
        { nodePath: "  Character/Shirt  ", slot: 1 },
        { nodePath: "Character/Buttons", slot: "0" },
        { nodePath: "Character/Sleeve", slot: -1 },
        null,
      ],
    })).toEqual({
      localId: "material:2",
      kind: "material",
      name: "Cloth",
      sourceIndex: 2,
      bindings: [{ nodePath: "Character/Shirt", slot: 1 }],
    });
  });

  it("derives exact, stable rig skin paths from validated bindings", () => {
    expect(decodeModelSubAssetPreviewTarget({
      localId: "skeleton:0",
      kind: "skeleton",
      name: "Rig",
      skins: [
        { bindings: [{ nodePath: "Rig/Zebra", nodeIndex: 8 }, { nodePath: "Rig/Arm", nodeIndex: 3 }] },
        { bindings: [{ nodePath: "Rig/Arm", nodeIndex: 3 }, { nodePath: " ", nodeIndex: -1 }, { nodePath: 3 }] },
        { bindings: "invalid" },
      ],
    })).toEqual({
      localId: "skeleton:0",
      kind: "skeleton",
      name: "Rig",
      skinNodePaths: ["Rig/Arm", "Rig/Zebra"],
      skinSourceNodeIndices: [3, 8],
    });
  });

  it("does not infer a preview type from a misleading name or local id", () => {
    expect(decodeModelSubAssetPreviewTarget({
      localId: "clip:looks-like-animation",
      kind: "future-importer-kind",
      name: "Idle Animation Clip",
      sourceIndex: 0,
    })).toEqual({
      localId: "clip:looks-like-animation",
      kind: "unknown",
      name: "Idle Animation Clip",
      sourceKind: "future-importer-kind",
    });
  });
});
