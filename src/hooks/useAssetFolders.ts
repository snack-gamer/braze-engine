import { useCallback, useEffect, useMemo, useState } from "react";
import { createAssetFolder, moveAsset, saveProjectSection } from "../lib/api";
import { projectPersistenceStore } from "../project/persistence/project-persistence-store";
import { useProjectSectionHydration } from "../project/persistence/useProjectSectionHydration";
import { LEGACY_PREFAB_ASSET_SUFFIX, PREFAB_ASSET_SUFFIX } from "../lib/prefabs";
import { INPUT_ACTION_MAP_ASSET_SUFFIX } from "../input/domain/input-action-map-asset-identity.mjs";
import {
  cleanFolderSegment,
  normalizeAssetFolderProjectState,
  normalizeFolderList,
  normalizeFolderPath,
  normalizeItemFolders,
  normalizeItemNames,
  projectAssetFolderState,
  type AssetFolderProjectState,
  type FolderPath,
} from "../project/persistence/asset-folder-project-section";

export type { AssetFolderProjectState, FolderPath } from "../project/persistence/asset-folder-project-section";

export type AssetKind =
  | "scene"
  | "material"
  | "model"
  | "image"
  | "prefab"
  | "hdri"
  | "inputActionMap"
  | "font"
  | "animatorController"
  | "avatarMask";

const FOLDERS_KEY = "tgan.folders";
const ITEMS_KEY = "tgan.itemFolders";
const NAMES_KEY = "tgan.itemNames";

const itemKey = (kind: AssetKind, id: string) => `${kind}:${id}`;
const diskBackedKind = (kind: AssetKind) => kind === "model" || kind === "image" || kind === "prefab" || kind === "inputActionMap" || kind === "font";

function notifyAssetDatabaseChanged() {
  window.dispatchEvent(new Event("braze:asset-database-changed"));
}

function moveDiskAsset(from: string, to: string) {
  if (from === to) return;
  void moveAsset(from, to)
    .then(notifyAssetDatabaseChanged)
    .catch((error) => console.error("Project asset move failed", error));
}

function assetExtension(filename: string): string {
  const lower = filename.toLowerCase();
  for (const suffix of [PREFAB_ASSET_SUFFIX, LEGACY_PREFAB_ASSET_SUFFIX, INPUT_ACTION_MAP_ASSET_SUFFIX]) {
    if (lower.endsWith(suffix)) return filename.slice(-suffix.length);
  }
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot) : "";
}

const parentOf = (path: FolderPath): FolderPath => {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
};

const basenameOf = (path: FolderPath): string => {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
};

// Project-global folder state. project.json is canonical; validated browser
// storage remains an offline/legacy recovery base and cannot be written back
// until useProjectSectionHydration reconciles it with the remote section.
export function useAssetFolders(physicalAssetPaths: string[] = []) {
  const [storedFolders, setStoredFolders] = useState<FolderPath[]>(() => {
    const rawFolders = loadJsonUnknown(FOLDERS_KEY);
    const rawItems = loadJsonUnknown(ITEMS_KEY);
    const assignedFolders = rawItems && typeof rawItems === "object" && !Array.isArray(rawItems)
      ? Object.values(rawItems)
      : [];
    return normalizeFolderList([
      ...(Array.isArray(rawFolders) ? rawFolders : []),
      ...assignedFolders,
    ]);
  });
  const [itemFolders, setItemFolders] = useState<Record<string, FolderPath>>(() =>
    normalizeItemFolders(loadJsonUnknown(ITEMS_KEY), new Set(storedFolders)),
  );
  // Display-name overrides for server-backed assets (models, images, HDRIs) whose
  // canonical name is derived from a filename on disk. Materials carry their
  // own `name` field and don't need this override.
  const [itemNames, setItemNames] = useState<Record<string, string>>(() =>
    normalizeItemNames(loadJsonUnknown(NAMES_KEY)),
  );
  const applyHydratedAssets = useCallback((value: AssetFolderProjectState) => {
    const normalized = normalizeAssetFolderProjectState(value);
    setStoredFolders(normalized.folders);
    setItemFolders(normalized.itemFolders);
    setItemNames(normalized.itemNames);
  }, []);
  const hydration = useProjectSectionHydration({
    section: "assets",
    initialValue: { folders: storedFolders, itemFolders, itemNames },
    currentValue: { folders: storedFolders, itemFolders, itemNames },
    remoteValue: projectAssetFolderState,
    applyValue: applyHydratedAssets,
  });

  useEffect(() => {
    saveJson(FOLDERS_KEY, storedFolders);
  }, [storedFolders]);

  useEffect(() => {
    saveJson(ITEMS_KEY, itemFolders);
  }, [itemFolders]);

  useEffect(() => {
    saveJson(NAMES_KEY, itemNames);
  }, [itemNames]);

  useEffect(() => {
    const value = { folders: storedFolders, itemFolders, itemNames };
    if (!hydration.ready || !hydration.needsPersistence(value)) return;
    const snapshot = value;
    const timeout = window.setTimeout(() => {
      void saveProjectSection("assets", snapshot)
        .then((project) => hydration.acceptPersistedValue(
          snapshot,
          projectAssetFolderState(project, snapshot),
        ))
        .catch(() => {
          // Keep the browser recovery copy, while the global project status
          // reports that canonical persistence has not completed.
        });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [
    hydration.acceptPersistedValue,
    hydration.needsPersistence,
    hydration.ready,
    storedFolders,
    itemFolders,
    itemNames,
  ]);

  useEffect(() => projectPersistenceStore.registerRetry(
    "assets",
    () => hydration.retryOrPersist(() => saveProjectSection(
      "assets",
      { folders: storedFolders, itemFolders, itemNames },
    ).then((project) => {
      const submitted = { folders: storedFolders, itemFolders, itemNames };
      hydration.acceptPersistedValue(submitted, projectAssetFolderState(project, submitted));
    })),
  ), [
    hydration.acceptPersistedValue,
    hydration.retryOrPersist,
    storedFolders,
    itemFolders,
    itemNames,
  ]);

  const physicalFolders = useMemo(() => {
    const next: FolderPath[] = [];
    for (const assetPath of physicalAssetPaths) {
      const normalized = String(assetPath || "").replace(/\\/g, "/");
      const slash = normalized.lastIndexOf("/");
      if (slash > 0) next.push(normalized.slice(0, slash));
    }
    return normalizeFolderList(next);
  }, [physicalAssetPaths]);

  // Disk paths are authoritative for project assets. Persisted folders remain
  // temporarily for material organization and empty-folder compatibility.
  const folders = useMemo(
    () => normalizeFolderList([...storedFolders, ...physicalFolders]),
    [physicalFolders, storedFolders],
  );

  const folderSet = useMemo(() => new Set(folders), [folders]);

  const subfoldersOf = useCallback(
    (path: FolderPath): FolderPath[] => folders.filter((f) => f && parentOf(f) === path).sort(),
    [folders],
  );

  const folderExists = useCallback((path: FolderPath) => path === "" || folderSet.has(path), [folderSet]);

  const folderOf = useCallback(
    (kind: AssetKind, id: string): FolderPath => {
      if (diskBackedKind(kind)) {
        const normalized = id.replace(/\\/g, "/");
        const slash = normalized.lastIndexOf("/");
        if (slash > 0) return normalized.slice(0, slash);
      }
      const raw = itemFolders[itemKey(kind, id)];
      if (raw && folderExists(raw)) return raw;
      return "";
    },
    [itemFolders, folderExists],
  );

  const createFolder = useCallback(
    (parent: FolderPath, rawName: string): FolderPath | null => {
      const name = cleanFolderSegment(rawName);
      if (!name) return null;
      const next = parent ? `${parent}/${name}` : name;
      if (folderSet.has(next)) return next;
      setStoredFolders((prev) => (prev.includes(next) ? prev : [...prev, next]));
      void createAssetFolder(next).catch((error) => console.error("Project folder creation failed", error));
      return next;
    },
    [folderSet],
  );

  const deleteFolder = useCallback((path: FolderPath) => {
    if (!path) return;
    setStoredFolders((prev) => prev.filter((f) => f !== path && !f.startsWith(`${path}/`)));
    // Items in the deleted folder (or its descendants) bubble up to the parent.
    const parent = parentOf(path);
    setItemFolders((prev) => {
      const next: Record<string, FolderPath> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (value === path || value.startsWith(`${path}/`)) {
          next[key] = parent;
        } else {
          next[key] = value;
        }
      }
      return next;
    });
  }, []);

  const renameFolder = useCallback(
    (oldPath: FolderPath, rawName: string) => {
      if (!oldPath) return;
      const name = cleanFolderSegment(rawName);
      if (!name) return;
      const parent = parentOf(oldPath);
      const newPath = parent ? `${parent}/${name}` : name;
      if (newPath === oldPath) return;
      if (folderSet.has(newPath)) return;
      moveDiskAsset(oldPath, newPath);
      setStoredFolders((prev) =>
        prev.map((f) => {
          if (f === oldPath) return newPath;
          if (f.startsWith(`${oldPath}/`)) return `${newPath}${f.slice(oldPath.length)}`;
          return f;
        }),
      );
      setItemFolders((prev) => {
        const next: Record<string, FolderPath> = {};
        for (const [key, value] of Object.entries(prev)) {
          if (value === oldPath) next[key] = newPath;
          else if (value.startsWith(`${oldPath}/`)) next[key] = `${newPath}${value.slice(oldPath.length)}`;
          else next[key] = value;
        }
        return next;
      });
    },
    [folderSet],
  );

  const displayNameFor = useCallback(
    (kind: AssetKind, id: string, fallback: string): string => itemNames[itemKey(kind, id)] ?? fallback,
    [itemNames],
  );

  const setDisplayName = useCallback((kind: AssetKind, id: string, name: string) => {
    const trimmed = name.trim().replace(/[\\/]/g, "-");
    if (diskBackedKind(kind) && trimmed) {
      const normalized = id.replace(/\\/g, "/");
      const slash = normalized.lastIndexOf("/");
      const parent = slash >= 0 ? normalized.slice(0, slash) : "";
      const extension = assetExtension(normalized.slice(slash + 1));
      const nextName = trimmed.toLowerCase().endsWith(extension.toLowerCase()) ? trimmed : `${trimmed}${extension}`;
      moveDiskAsset(normalized, parent ? `${parent}/${nextName}` : nextName);
      return;
    }
    setItemNames((prev) => {
      const key = itemKey(kind, id);
      if (!trimmed) {
        if (!(key in prev)) return prev;
        const { [key]: _drop, ...rest } = prev;
        return rest;
      }
      if (prev[key] === trimmed) return prev;
      return { ...prev, [key]: trimmed };
    });
  }, []);

  const moveItem = useCallback((kind: AssetKind, id: string, target: FolderPath) => {
    const safeTarget = normalizeFolderPath(target);
    if (diskBackedKind(kind)) {
      const normalized = id.replace(/\\/g, "/");
      const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
      moveDiskAsset(normalized, safeTarget ? `${safeTarget}/${basename}` : basename);
      return;
    }
    if (safeTarget) {
      setStoredFolders((prev) => {
        const next = new Set(prev);
        const parts = safeTarget.split("/");
        for (let i = 1; i <= parts.length; i += 1) next.add(parts.slice(0, i).join("/"));
        return next.size === prev.length ? prev : Array.from(next).sort();
      });
    }
    setItemFolders((prev) => {
      const key = itemKey(kind, id);
      if (prev[key] === safeTarget) return prev;
      // Empty target = root: omit from the map entirely to keep storage tight.
      if (!safeTarget) {
        if (!(key in prev)) return prev;
        const { [key]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: safeTarget };
    });
  }, []);

  return {
    folders,
    subfoldersOf,
    folderExists,
    folderOf,
    createFolder,
    deleteFolder,
    renameFolder,
    moveItem,
    displayNameFor,
    setDisplayName,
    parentOf,
    basenameOf,
  };
}

function loadJsonUnknown(key: string): unknown {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function saveJson<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota / private mode — folder layout is convenience, not correctness.
  }
}
