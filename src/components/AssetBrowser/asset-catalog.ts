import type { AssetKind, FolderPath } from "../../hooks/useAssetFolders";
import type { AssetSubAsset, LibraryAsset } from "../../lib/api";
import type { Material } from "../../types";
import type {
  AuthoredAvatarMask,
} from "../../character/domain/character-asset-library";
import type { AssetFilter, ItemKey } from "./types";
import {
  importedModelSubAssets,
  modelSubAssetKey,
} from "./model-subasset-catalog";
import { modelSubAssetSupportsFilter } from "../model-subasset-presentation";

export type ProjectSceneEntry = { id: string; name: string; active: boolean; objectCount: number | null };

export type AssetCatalogEntry =
  | { kind: "scene"; key: ItemKey; scene: ProjectSceneEntry; displayName: string }
  | { kind: "folder"; key: ItemKey; path: FolderPath; displayName: string }
  | { kind: "material"; key: ItemKey; material: Material; displayName: string }
  | { kind: "avatarMask"; key: ItemKey; asset: AuthoredAvatarMask; displayName: string }
  | { kind: "modelSubAsset"; key: ItemKey; asset: LibraryAsset; subAsset: AssetSubAsset; displayName: string }
  | { kind: "model" | "image" | "prefab" | "hdri" | "inputActionMap" | "font"; key: ItemKey; asset: LibraryAsset; displayName: string };

type AssetCatalogFolderIndex = {
  folderOf: (kind: AssetKind, id: string) => FolderPath;
  displayNameFor: (kind: AssetKind, id: string, fallback: string) => string;
  basenameOf: (path: FolderPath) => string;
};

export type BuildAssetCatalogInput = {
  scenes?: readonly ProjectSceneEntry[];
  path: FolderPath;
  search: string;
  filter: AssetFilter;
  subfolders: readonly FolderPath[];
  materials: readonly Material[];
  avatarMasks: readonly AuthoredAvatarMask[];
  models: readonly LibraryAsset[];
  images: readonly LibraryAsset[];
  prefabs: readonly LibraryAsset[];
  hdris: readonly LibraryAsset[];
  fonts?: readonly LibraryAsset[];
  inputActionMaps?: readonly LibraryAsset[];
  favoriteKeys: ReadonlySet<ItemKey>;
  recentKeys: ReadonlySet<ItemKey>;
  expandedModelFilenames?: ReadonlySet<string>;
  folders: AssetCatalogFolderIndex;
};

/** Builds the stable, visual ordering used by rendering and range selection. */
export function buildAssetCatalog(input: BuildAssetCatalogInput): AssetCatalogEntry[] {
  const query = input.search.trim().toLowerCase();
  const searching = query.length > 0;
  const entries: AssetCatalogEntry[] = [];

  if (!searching && input.filter === "all") {
    for (const path of input.subfolders) {
      entries.push({ kind: "folder", key: `folder:${path}`, path, displayName: input.folders.basenameOf(path) });
    }
  }

  if (searching || input.filter !== "all" || input.path === "") {
    for (const scene of input.scenes ?? []) {
      if (!filterAllows("scene", scene.id, input) || (query && !scene.name.toLowerCase().includes(query))) continue;
      entries.push({ kind: "scene", key: `scene:${scene.id}`, scene, displayName: scene.name });
    }
  }

  for (const material of sourceFor(input.materials, "material", input, searching)) {
    if (!filterAllows("material", material.id, input)) continue;
    if (searching && !material.name.toLowerCase().includes(query)) continue;
    entries.push({
      kind: "material",
      key: `material:${material.id}`,
      material,
      displayName: leafDisplayName(material.name),
    });
  }

  appendAvatarMasks(entries, input, query, searching);

  appendModelAssets(entries, sourceFor(input.models, "model", input, searching), input, query, searching);
  appendLibraryAssets(entries, "image", sourceFor(input.images, "image", input, searching), input, query);
  appendLibraryAssets(entries, "prefab", sourceFor(input.prefabs, "prefab", input, searching), input, query);
  appendLibraryAssets(entries, "hdri", sourceFor(input.hdris, "hdri", input, searching), input, query);
  appendLibraryAssets(entries, "font", sourceFor(input.fonts ?? [], "font", input, searching), input, query);
  appendLibraryAssets(entries, "inputActionMap", sourceFor(input.inputActionMaps ?? [], "inputActionMap", input, searching), input, query);
  return entries;
}

function appendModelAssets(
  entries: AssetCatalogEntry[],
  source: readonly LibraryAsset[],
  input: BuildAssetCatalogInput,
  query: string,
  searching: boolean,
) {
  for (const asset of source) {
    const displayName = input.folders.displayNameFor("model", asset.filename, asset.name);
    const subAssets = importedModelSubAssets(asset);
    const matchingSubAssets = query
      ? subAssets.filter((subAsset) => `${subAsset.name} ${subAsset.kind}`.toLowerCase().includes(query))
      : subAssets;
    const parentMatches = !query
      || displayName.toLowerCase().includes(query)
      || asset.filename.toLowerCase().includes(query);
    const parentAllowed = filterAllows("model", asset.filename, input);
    if (parentAllowed && (parentMatches || matchingSubAssets.length > 0)) {
      entries.push({ kind: "model", key: `model:${asset.filename}`, asset, displayName });
    }

    const showExpanded = input.expandedModelFilenames?.has(asset.filename) === true;
    const filterableSubAssets = matchingSubAssets.filter((item) => (
      modelSubAssetSupportsFilter(item.kind, input.filter)
    ));
    const visibleSubAssets = input.filter === "animation"
      ? filterableSubAssets
      : (input.filter === "all" || input.filter === "models")
        ? (showExpanded || searching ? filterableSubAssets : [])
        : [];
    for (const subAsset of visibleSubAssets) {
      entries.push({
        kind: "modelSubAsset",
        key: modelSubAssetKey(asset.filename, subAsset.localId),
        asset,
        subAsset,
        displayName: subAsset.name,
      });
    }
  }
}

function sourceFor<T extends Material | LibraryAsset>(
  source: readonly T[],
  kind: AssetKind,
  input: BuildAssetCatalogInput,
  searching: boolean,
): readonly T[] {
  if (searching || input.filter !== "all") return source;
  return source.filter((item) => input.folders.folderOf(kind, assetIdentity(kind, item)) === input.path);
}

function appendAvatarMasks(
  entries: AssetCatalogEntry[],
  input: BuildAssetCatalogInput,
  query: string,
  searching: boolean,
) {
  const source = searching || input.filter !== "all"
    ? input.avatarMasks
    : input.avatarMasks.filter((asset) => input.folders.folderOf("avatarMask", asset.id) === input.path);
  for (const asset of source) {
    if (!filterAllows("avatarMask", asset.id, input)) continue;
    if (query && !asset.name.toLowerCase().includes(query)) continue;
    entries.push({ kind: "avatarMask", key: `avatarMask:${asset.id}`, asset, displayName: asset.name });
  }
}

function appendLibraryAssets(
  entries: AssetCatalogEntry[],
  kind: "model" | "image" | "prefab" | "hdri" | "inputActionMap" | "font",
  source: readonly LibraryAsset[],
  input: BuildAssetCatalogInput,
  query: string,
) {
  for (const asset of source) {
    if (!filterAllows(kind, asset.filename, input)) continue;
    const displayName = input.folders.displayNameFor(kind, asset.filename, asset.name);
    if (query && !displayName.toLowerCase().includes(query) && !asset.filename.toLowerCase().includes(query)) continue;
    entries.push({ kind, key: `${kind}:${asset.filename}`, asset, displayName });
  }
}

function assetIdentity(kind: AssetKind, item: Material | LibraryAsset): string {
  return kind === "material" ? (item as Material).id : (item as LibraryAsset).filename;
}

function leafDisplayName(value: string): string {
  const segments = value.split(/[\\/]/).map((segment) => segment.trim()).filter(Boolean);
  return segments[segments.length - 1] ?? value.trim();
}

function filterAllows(kind: AssetKind, id: string, input: BuildAssetCatalogInput): boolean {
  const key = `${kind}:${id}`;
  switch (input.filter) {
    case "all": return true;
    case "scenes": return kind === "scene";
    case "models": return kind === "model";
    case "fonts": return kind === "font";
    case "images":
    case "textures": return kind === "image";
    case "materials": return kind === "material";
    case "prefabs": return kind === "prefab";
    case "animation": return kind === "avatarMask";
    case "input": return kind === "inputActionMap";
    case "hdris": return kind === "hdri";
    case "favorites": return input.favoriteKeys.has(key);
    case "recent": return input.recentKeys.has(key);
  }
}
