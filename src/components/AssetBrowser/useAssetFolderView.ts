import { useCallback, useEffect, useMemo, useState } from "react";
import { useAssetFolders, type FolderPath } from "../../hooks/useAssetFolders";
import type { LibraryAsset } from "../../lib/api";
import type { Material } from "../../types";
import type {
  AuthoredAvatarMask,
} from "../../character/domain/character-asset-library";
import { buildNonEmptyFolderSet } from "./model";
import { isStringArray, usePersistedJson } from "./preferences";

type AssetFolderViewInput = {
  physicalAssetPaths: string[];
  materials: readonly Material[];
  avatarMasks: readonly AuthoredAvatarMask[];
  models: readonly LibraryAsset[];
  images: readonly LibraryAsset[];
  prefabs: readonly LibraryAsset[];
  hdris: readonly LibraryAsset[];
  fonts?: readonly LibraryAsset[];
  inputActionMaps: readonly LibraryAsset[];
};

export function useAssetFolderView(input: AssetFolderViewInput) {
  const folders = useAssetFolders(input.physicalAssetPaths);
  const [path, setPath] = useState<FolderPath>("");
  const [expandedFolders, setExpandedFolders] = usePersistedJson<FolderPath[]>(
    "braze.projectExpandedFolders",
    [""],
    isStringArray,
  );

  useEffect(() => {
    if (path && !folders.folderExists(path)) setPath("");
  }, [folders.folderExists, path]);

  const subfolders = useMemo(() => folders.subfoldersOf(path), [folders.subfoldersOf, path]);
  const folderChildren = useMemo(() => {
    const children = new Map<FolderPath, FolderPath[]>([["", []]]);
    for (const folderPath of folders.folders) {
      const parent = folders.parentOf(folderPath);
      const siblings = children.get(parent) ?? [];
      siblings.push(folderPath);
      children.set(parent, siblings);
      if (!children.has(folderPath)) children.set(folderPath, []);
    }
    for (const siblings of children.values()) {
      siblings.sort((left, right) => folders.basenameOf(left).localeCompare(folders.basenameOf(right)));
    }
    return children;
  }, [folders.basenameOf, folders.folders, folders.parentOf]);

  const expandedFolderSet = useMemo(() => new Set(expandedFolders), [expandedFolders]);
  const toggleFolderExpanded = useCallback((folderPath: FolderPath) => {
    setExpandedFolders((previous) => {
      const next = new Set(previous);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return Array.from(next);
    });
  }, [setExpandedFolders]);

  useEffect(() => {
    const ancestors = new Set<FolderPath>([""]);
    let current = path;
    while (current) {
      ancestors.add(current);
      current = folders.parentOf(current);
    }
    setExpandedFolders((previous) => {
      const next = new Set(previous);
      let changed = false;
      for (const ancestor of ancestors) {
        if (next.has(ancestor)) continue;
        next.add(ancestor);
        changed = true;
      }
      return changed ? Array.from(next) : previous;
    });
  }, [folders.parentOf, path, setExpandedFolders]);

  const nonEmptyFolders = useMemo(() => buildNonEmptyFolderSet(
    folders.folders,
    [
      ...input.materials.map((material) => folders.folderOf("material", material.id)),
      ...input.avatarMasks.map((asset) => folders.folderOf("avatarMask", asset.id)),
      ...input.models.map((asset) => folders.folderOf("model", asset.filename)),
      ...input.images.map((asset) => folders.folderOf("image", asset.filename)),
      ...input.prefabs.map((asset) => folders.folderOf("prefab", asset.filename)),
      ...(input.fonts ?? []).map((asset) => folders.folderOf("font", asset.filename)),
      ...input.inputActionMaps.map((asset) => folders.folderOf("inputActionMap", asset.filename)),
      ...input.hdris.map((asset) => folders.folderOf("hdri", asset.filename)),
    ],
    folders.parentOf,
  ), [folders.folderOf, folders.folders, folders.parentOf, input.avatarMasks, input.fonts, input.inputActionMaps, input.hdris, input.images, input.materials, input.models, input.prefabs]);

  return {
    folders,
    path,
    setPath,
    subfolders,
    folderChildren,
    expandedFolderSet,
    toggleFolderExpanded,
    nonEmptyFolders,
  };
}
