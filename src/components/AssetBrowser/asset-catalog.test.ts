import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "../../lib/api";
import type { Material } from "../../types";
import { buildAssetCatalog } from "./asset-catalog";

const material = (id: string, name = id) => ({ id, name } as Material);
const asset = (filename: string, name = filename) => ({ filename, name } as LibraryAsset);
const folderOf = (_kind: string, id: string) => id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "";
const folders = {
  folderOf,
  displayNameFor: (_kind: string, _id: string, fallback: string) => fallback,
  basenameOf: (path: string) => path.slice(path.lastIndexOf("/") + 1),
};

describe("buildAssetCatalog", () => {
  it("discovers Input Action Maps in their folder, search and dedicated filter", () => {
    const controls = asset("Input/Controls.braze-input.json", "Controls");
    const input = { path: "Input", search: "", filter: "all" as const, subfolders: [], materials: [],
      avatarMasks: [], models: [], images: [], prefabs: [], hdris: [], inputActionMaps: [controls],
      favoriteKeys: new Set(["inputActionMap:Input/Controls.braze-input.json"]), recentKeys: new Set<string>(), folders };
    expect(buildAssetCatalog(input)[0]).toMatchObject({ kind: "inputActionMap", asset: controls });
    expect(buildAssetCatalog({ ...input, path: "Elsewhere" })).toEqual([]);
    for (const filter of ["input", "favorites"] as const) {
      expect(buildAssetCatalog({ ...input, path: "Elsewhere", filter })[0]?.kind).toBe("inputActionMap");
    }
    expect(buildAssetCatalog({ ...input, path: "Elsewhere", search: "CONTROLS" })[0]?.kind).toBe("inputActionMap");
    expect(buildAssetCatalog({ ...input, filter: "models" })).toEqual([]);
  });
  it("finds scenes by name and filter without placing them in unrelated folders", () => {
    const input = {
      path: "", search: "", filter: "all" as const, subfolders: [],
      scenes: [{ id: "scene-a", name: "Moon Base", active: true, objectCount: 2 }],
      materials: [material("metal")], avatarMasks: [], models: [], images: [], prefabs: [], hdris: [],
      favoriteKeys: new Set(["scene:scene-a"]), recentKeys: new Set(["scene:scene-a"]), folders,
    };
    expect(buildAssetCatalog(input).map((entry) => entry.key)).toEqual(["scene:scene-a", "material:metal"]);
    expect(buildAssetCatalog({ ...input, path: "models" })).toEqual([]);
    for (const filter of ["scenes", "favorites", "recent"] as const) {
      expect(buildAssetCatalog({ ...input, path: "models", filter }).map((entry) => entry.key)).toEqual(["scene:scene-a"]);
    }
    expect(buildAssetCatalog({ ...input, path: "models", search: "MOON" })[0]?.key).toBe("scene:scene-a");
    expect(buildAssetCatalog({ ...input, filter: "models" })).toEqual([]);
  });
  it("keeps folder-first, kind-grouped ordering for the current folder", () => {
    const entries = buildAssetCatalog({
      path: "city",
      search: "",
      filter: "all",
      subfolders: ["city/buildings", "city/roads"],
      materials: [material("root"), material("city/masonry")],
      avatarMasks: [],
      models: [asset("city/tower.glb"), asset("forest/tree.glb")],
      images: [asset("city/sign.png")],
      prefabs: [asset("city/lamp.prefab.json")],
      hdris: [asset("sunset.hdr")],
      favoriteKeys: new Set(),
      recentKeys: new Set(),
      folders,
    });

    expect(entries.map((entry) => entry.key)).toEqual([
      "folder:city/buildings",
      "folder:city/roads",
      "material:city/masonry",
      "model:city/tower.glb",
      "image:city/sign.png",
      "prefab:city/lamp.prefab.json",
    ]);
  });

  it("searches recursively without folders and honors favorite filtering", () => {
    const base = {
      path: "city",
      subfolders: ["city/buildings"],
      materials: [material("brick", "Red Brick")],
      avatarMasks: [],
      models: [asset("forest/tree.glb", "Tree")],
      images: [asset("city/brick.png", "Brick Albedo")],
      prefabs: [],
      hdris: [],
      favoriteKeys: new Set(["image:city/brick.png"]),
      recentKeys: new Set<string>(),
      folders,
    } as const;

    expect(buildAssetCatalog({ ...base, search: "brick", filter: "all" }).map((entry) => entry.key)).toEqual([
      "material:brick",
      "image:city/brick.png",
    ]);
    expect(buildAssetCatalog({ ...base, search: "", filter: "favorites" }).map((entry) => entry.key)).toEqual([
      "image:city/brick.png",
    ]);
  });

  it("expands imported model contents without inventing physical folders", () => {
    const hero = asset("characters/hero.fbx", "Hero");
    hero.subAssets = [
      { localId: "main", kind: "model", name: "Hero" },
      { localId: "mesh:body", kind: "mesh", name: "Body" },
      { localId: "clip:Idle", kind: "clip", name: "Idle", sourceIndex: 0 },
      { localId: "material:skin", kind: "material", name: "Skin" },
    ];
    const input = {
      path: "characters",
      search: "",
      filter: "all" as const,
      subfolders: [],
      materials: [],
      avatarMasks: [],
      models: [hero],
      images: [],
      prefabs: [],
      hdris: [],
      favoriteKeys: new Set<string>(),
      recentKeys: new Set<string>(),
      folders,
    };

    expect(buildAssetCatalog(input).map((entry) => entry.kind)).toEqual(["model"]);
    const expanded = buildAssetCatalog({
      ...input,
      expandedModelFilenames: new Set([hero.filename]),
    });
    expect(expanded.map((entry) => [entry.kind, entry.displayName])).toEqual([
      ["model", "Hero"],
      ["modelSubAsset", "Body"],
      ["modelSubAsset", "Idle"],
      ["modelSubAsset", "Skin"],
    ]);
  });

  it("shows imported material leaf names without exposing source separators", () => {
    const imported = material("skin", "Aerial-Evade / Beta_Joints_MAT1");
    const entries = buildAssetCatalog({
      path: "",
      search: "",
      filter: "all",
      subfolders: [],
      materials: [imported],
      avatarMasks: [],
      models: [],
      images: [],
      prefabs: [],
      hdris: [],
      favoriteKeys: new Set(),
      recentKeys: new Set(),
      folders,
    });

    expect(entries).toMatchObject([{
      kind: "material",
      displayName: "Beta_Joints_MAT1",
      material: { name: "Aerial-Evade / Beta_Joints_MAT1" },
    }]);
  });

  it("uses registered sub-asset filter membership for Animation and recursive search", () => {
    const hero = asset("characters/hero.fbx", "Hero");
    hero.subAssets = [
      { localId: "main", kind: "model", name: "Hero" },
      { localId: "clip:Run", kind: "clip", name: "Run" },
      { localId: "avatar:Hero", kind: "avatar", name: "Hero Avatar" },
      { localId: "skeleton:Hero", kind: "skeleton", name: "Hero Skeleton" },
      { localId: "mesh:body", kind: "mesh", name: "Body" },
      { localId: "future:mystery", kind: "future-kind", name: "Mystery" },
    ];
    const input = {
      path: "",
      search: "",
      filter: "animation" as const,
      subfolders: [],
      materials: [],
      avatarMasks: [],
      models: [hero],
      images: [],
      prefabs: [],
      hdris: [],
      favoriteKeys: new Set<string>(),
      recentKeys: new Set<string>(),
      folders,
    };

    expect(buildAssetCatalog(input).map((entry) => entry.displayName)).toEqual([
      "Run",
      "Hero Avatar",
      "Hero Skeleton",
    ]);
    expect(buildAssetCatalog({ ...input, filter: "all", search: "run" }).map((entry) => entry.displayName))
      .toEqual(["Hero", "Run"]);
  });
});
