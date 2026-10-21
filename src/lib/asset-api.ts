import type { ModelImportSettings } from "./model-import-settings";
import { bundledModelImportDocument } from "../assets/application/model-import-document-provider";

type ApiResponse<T> = T & { status: string; message?: string };

async function postJson<T>(path: string, body: object): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json() as ApiResponse<T>;
  if (!response.ok || data.status !== "ok") throw new Error(data.message || `${path} failed`);
  return data;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const data = await response.json() as ApiResponse<T>;
  if (!response.ok || data.status !== "ok") throw new Error(data.message || `${path} failed`);
  return data;
}

export type LibraryAsset = {
  guid?: string;
  name: string;
  filename: string;
  kind?: "model" | "image" | "prefab" | "inputActionMap" | "font";
  importerId?: string;
  status?: "ready" | "dirty" | "importing" | "failed" | "missing";
  foreignIds?: Record<string, string>;
  dependencies?: AssetDependency[];
  subAssets?: AssetSubAsset[];
  diagnostics?: AssetDiagnostic[];
  contentRevision?: string | null;
  path: string;
  url: string;
  sizeBytes: number;
  updatedAt?: string;
};

export type AssetDependency = {
  kind: string;
  path?: string;
  guid?: string;
  localId?: string;
  objectId?: string;
  relationship?: string;
  [detail: string]: unknown;
};

export type AssetSubAsset = {
  localId: string;
  kind: string;
  name: string;
  sourceIndex?: number;
  objectId?: string;
  inspectorValues?: Record<string, string | number>;
  /** Importer-specific derived facts; authored code must validate before use. */
  [detail: string]: unknown;
};

export type AssetDiagnostic = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  guid?: string;
  sourcePaths?: string[];
  objectId?: string;
  localId?: string;
  [detail: string]: unknown;
};

export type UploadedAsset = LibraryAsset & { reused?: boolean };

export type PrefabAssetDocument = {
  prefab: unknown;
  revision: string;
};

export type PrefabSaveResult = {
  asset: LibraryAsset;
  revision: string;
};

export class PrefabSaveConflictError extends Error {
  readonly actualRevision: string | null;

  constructor(actualRevision: string | null) {
    super(
      "This prefab changed on disk after it was opened. Your edits are still unsaved; close and reopen the prefab to reload it before saving again.",
    );
    this.name = "PrefabSaveConflictError";
    this.actualRevision = actualRevision;
  }
}

export type ModelImportDocument = {
  version: string;
  sourceFilename: string;
  settings: ModelImportSettings;
  /** Revision of the adjacent .braze.meta document used for conflict-safe writes. */
  revision: string;
  updatedAt: string | null;
  importVersion: string;
};

export async function uploadAsset(file: File, folder = ""): Promise<UploadedAsset> {
  const params = new URLSearchParams({ name: file.name });
  if (folder) params.set("folder", folder);
  const response = await fetch(`/api/assets?${params.toString()}`, {
    method: "POST",
    body: file,
  });
  const data = await response.json() as { status: string; message?: string; asset: UploadedAsset };
  if (!response.ok || data.status !== "ok") throw new Error(data.message || "Asset upload failed");
  return data.asset;
}

export async function uploadAssetToFolder(
  file: File | Blob,
  folder: string,
  relativePath: string,
  name = relativePath.split("/").pop() || "asset.bin",
): Promise<UploadedAsset> {
  const params = new URLSearchParams({ name, folder, path: relativePath });
  const response = await fetch(`/api/assets?${params.toString()}`, {
    method: "POST",
    body: file,
  });
  const data = await response.json() as { status: string; message?: string; asset: UploadedAsset };
  if (!response.ok || data.status !== "ok") throw new Error(data.message || "Asset upload failed");
  return data.asset;
}

export async function savePrefabAsset(name: string, prefab: object): Promise<UploadedAsset> {
  const data = await postJson<{ asset: UploadedAsset; revision: string }>(
    "/api/assets/prefab",
    { name, prefab },
  );
  return { ...data.asset, contentRevision: data.revision };
}

export async function fetchPrefabAssetDocument(filename: string): Promise<PrefabAssetDocument> {
  const response = await fetch(
    `/api/assets/prefab?filename=${encodeURIComponent(filename)}`,
    { cache: "no-store" },
  );
  const data = await response.json() as ApiResponse<{
    prefab?: unknown;
    revision?: string | null;
  }>;
  if (!response.ok || data.status !== "ok" || typeof data.revision !== "string") {
    throw new Error(data.message || `Failed to load prefab: ${filename}`);
  }
  return { prefab: data.prefab, revision: data.revision };
}

export async function updatePrefabAsset(
  filename: string,
  name: string,
  prefab: object,
  baseRevision: string | null,
  assetGuid?: string,
): Promise<PrefabSaveResult> {
  const response = await fetch(`/api/assets/prefab?filename=${encodeURIComponent(filename)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, prefab, baseRevision, assetGuid }),
  });
  const data = await response.json() as ApiResponse<{
    asset?: LibraryAsset;
    revision?: string;
    actualRevision?: string | null;
  }>;
  if (response.status === 409) {
    throw new PrefabSaveConflictError(
      typeof data.actualRevision === "string" ? data.actualRevision : null,
    );
  }
  if (
    !response.ok
    || data.status !== "ok"
    || !data.asset
    || typeof data.revision !== "string"
  ) {
    throw new Error(data.message || "Prefab update failed");
  }
  return {
    asset: { ...data.asset, contentRevision: data.revision },
    revision: data.revision,
  };
}

export async function listAssets(): Promise<LibraryAsset[]> {
  const data = await getJson<{ assets: LibraryAsset[] }>("/api/assets");
  return data.assets;
}

export async function deleteAsset(filename: string): Promise<void> {
  const response = await fetch(`/api/assets?filename=${encodeURIComponent(filename)}`, { method: "DELETE" });
  const data = await response.json() as { status: string; message?: string };
  if (!response.ok || data.status !== "ok") throw new Error(data.message || "Asset delete failed");
}

export async function duplicateAsset(filename: string): Promise<LibraryAsset> {
  const data = await postJson<{ asset: LibraryAsset }>(
    `/api/assets/duplicate?filename=${encodeURIComponent(filename)}`,
    {},
  );
  return data.asset;
}

export async function createAssetFolder(folder: string): Promise<string> {
  const data = await postJson<{ folder: string }>("/api/assets/folder", { path: folder });
  return data.folder;
}

export async function moveAsset(filename: string, destination: string): Promise<LibraryAsset | null> {
  const data = await postJson<{ asset: LibraryAsset | null }>("/api/assets/move", {
    filename,
    to: destination,
  });
  return data.asset;
}

export async function revealAsset(filename: string): Promise<void> {
  await postJson(`/api/assets/reveal?filename=${encodeURIComponent(filename)}`, {});
}

export async function fetchModelImport(filename: string): Promise<ModelImportDocument> {
  const bundled = bundledModelImportDocument(filename);
  if (bundled) return bundled;
  const data = await getJson<{ import: ModelImportDocument }>(
    `/api/assets/import-settings?filename=${encodeURIComponent(filename)}`,
  );
  return data.import;
}

export async function saveModelImport(
  filename: string,
  settings: ModelImportSettings,
  baseRevision: string,
): Promise<ModelImportDocument> {
  const response = await fetch(`/api/assets/import-settings?filename=${encodeURIComponent(filename)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings, baseRevision }),
  });
  const data = await response.json() as ApiResponse<{
    import: ModelImportDocument;
  }>;
  if (response.status === 409) {
    throw new Error(data.message || "Metadata changed; reload and retry");
  }
  if (!response.ok || data.status !== "ok") throw new Error(data.message || "Import settings save failed");
  return data.import;
}
