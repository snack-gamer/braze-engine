import type { ProjectFile } from "../../lib/project-api";

export type FolderPath = string;

export type AssetFolderProjectState = {
  folders: FolderPath[];
  itemFolders: Record<string, FolderPath>;
  itemNames: Record<string, string>;
};

export const cleanFolderSegment = (value: string): string => value.trim().replace(/\//g, "-");

export function normalizeFolderPath(raw: unknown): FolderPath {
  return String(raw ?? "")
    .split("/")
    .map(cleanFolderSegment)
    .filter(Boolean)
    .join("/");
}

export function normalizeFolderList(rawFolders: unknown[]): FolderPath[] {
  const out = new Set<FolderPath>();
  for (const rawPath of rawFolders) {
    const path = normalizeFolderPath(rawPath);
    if (!path) continue;
    const parts = path.split("/");
    for (let index = 1; index <= parts.length; index += 1) {
      out.add(parts.slice(0, index).join("/"));
    }
  }
  return Array.from(out).sort();
}

export function normalizeItemFolders(
  raw: unknown,
  validFolders: ReadonlySet<FolderPath>,
): Record<string, FolderPath> {
  if (!raw || typeof raw !== "object") return {};
  const next: Record<string, FolderPath> = {};
  for (const [key, value] of Object.entries(raw)) {
    const path = normalizeFolderPath(value);
    if (path && validFolders.has(path)) next[key] = path;
  }
  return next;
}

export function normalizeItemNames(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const name = String(value ?? "").trim();
    if (name) next[key] = name;
  }
  return next;
}

export function normalizeAssetFolderProjectState(
  value: AssetFolderProjectState,
): AssetFolderProjectState {
  const folders = normalizeFolderList([...value.folders, ...Object.values(value.itemFolders)]);
  return {
    folders,
    itemFolders: normalizeItemFolders(value.itemFolders, new Set(folders)),
    itemNames: normalizeItemNames(value.itemNames),
  };
}

function assertStringRecord(raw: unknown, label: string): asserts raw is Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label} must be an object`);
  }
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") throw new Error(`${label}.${key} must be a string`);
  }
}

/** Decodes canonical folder metadata without silently dropping malformed data. */
export function projectAssetFolderState(
  project: ProjectFile,
  fallback: AssetFolderProjectState,
): AssetFolderProjectState {
  if (!Object.prototype.hasOwnProperty.call(project, "assets")) return fallback;
  const assets = project.assets;
  if (!assets || typeof assets !== "object" || Array.isArray(assets)) {
    throw new Error("project assets must be an object");
  }
  if (assets.folders !== undefined && (
    !Array.isArray(assets.folders)
    || assets.folders.some((folder) => typeof folder !== "string")
  )) {
    throw new Error("project assets.folders must be an array of strings");
  }
  if (assets.itemFolders !== undefined) {
    assertStringRecord(assets.itemFolders, "project assets.itemFolders");
  }
  if (assets.itemNames !== undefined) {
    assertStringRecord(assets.itemNames, "project assets.itemNames");
  }
  return normalizeAssetFolderProjectState({
    folders: assets.folders ?? [],
    itemFolders: assets.itemFolders ?? {},
    itemNames: assets.itemNames ?? {},
  });
}
