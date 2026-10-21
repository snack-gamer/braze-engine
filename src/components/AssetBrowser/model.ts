import type { LibraryAsset } from "../../lib/api";
import { isImageAsset, isPrefabAsset, isModelAsset } from "../../assets/import-support";
import type { AssetKind, FolderPath } from "../../hooks/useAssetFolders";
import type { AssetFilter, ItemKey } from "./types";


export const TILE_MIN = 48;
export const TILE_MAX = 128;
export const TILE_DEFAULT = 72;
export const ZOOM_STEP = 12;
export const PREVIEW_THRESHOLD = 72;

export const ASSET_FILTERS: Array<{ id: AssetFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "scenes", label: "Scenes" },
  { id: "models", label: "Models" },
  { id: "fonts", label: "Fonts" },
  { id: "images", label: "Images" },
  { id: "textures", label: "Textures" },
  { id: "materials", label: "Materials" },
  { id: "prefabs", label: "Prefabs" },
  { id: "animation", label: "Animation" },
  { id: "input", label: "Input" },
  { id: "hdris", label: "HDRIs" },
  { id: "favorites", label: "Favorites" },
  { id: "recent", label: "Recent" },
];

export function libraryAssetKind(asset: LibraryAsset): "model" | "image" | "prefab" | "inputActionMap" | "font" | undefined {
  if (asset.kind === "font") return "font";
  if (asset.kind === "inputActionMap") return "inputActionMap";
  if (isPrefabAsset(asset)) return "prefab";
  if (isImageAsset(asset)) return "image";
  if (isModelAsset(asset)) return "model";
  return undefined;
}

export function pathInsideFolder(value: string, folder: FolderPath): boolean {
  return Boolean(folder) && (value === folder || value.startsWith(`${folder}/`));
}

export function assetFilenameInsideFolder(filename: string, folder: FolderPath): boolean {
  return Boolean(folder) && filename.startsWith(`${folder}/`);
}

export function buildNonEmptyFolderSet(
  folderPaths: Iterable<FolderPath>,
  itemFolderPaths: Iterable<FolderPath>,
  parentOf: (path: FolderPath) => FolderPath,
): ReadonlySet<FolderPath> {
  const result = new Set<FolderPath>();
  const markAncestors = (path: FolderPath) => {
    let current = path;
    while (!result.has(current)) {
      result.add(current);
      if (!current) break;
      current = parentOf(current);
    }
  };

  for (const folderPath of folderPaths) markAncestors(parentOf(folderPath));
  for (const itemFolderPath of itemFolderPaths) markAncestors(itemFolderPath);
  return result;
}

export function buildCrumbs(path: FolderPath): Array<{ label: string; path: FolderPath }> {
  const crumbs: Array<{ label: string; path: FolderPath }> = [{ label: "Assets", path: "" }];
  if (!path) return crumbs;
  let cumulative = "";
  for (const segment of path.split("/")) {
    cumulative = cumulative ? `${cumulative}/${segment}` : segment;
    crumbs.push({ label: segment, path: cumulative });
  }
  return crumbs;
}

export function splitKey(key: ItemKey): ["folder" | AssetKind, string] {
  const separator = key.indexOf(":");
  return [key.slice(0, separator) as "folder" | AssetKind, key.slice(separator + 1)];
}
