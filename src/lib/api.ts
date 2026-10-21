import type { LibraryAsset as AssetLibraryAsset } from "./asset-api";

export {
  createAssetFolder,
  deleteAsset,
  duplicateAsset,
  fetchPrefabAssetDocument,
  fetchModelImport,
  listAssets,
  moveAsset,
  PrefabSaveConflictError,
  revealAsset,
  saveModelImport,
  savePrefabAsset,
  updatePrefabAsset,
  uploadAsset,
  uploadAssetToFolder,
} from "./asset-api";
export type {
  AssetDependency,
  AssetDiagnostic,
  AssetSubAsset,
  LibraryAsset,
  ModelImportDocument,
  PrefabAssetDocument,
  PrefabSaveResult,
  UploadedAsset,
} from "./asset-api";
export {
  SceneSaveConflictError,
  canKeepaliveSceneSave,
  fetchSavedScene,
  fetchSavedSceneDocument,
  listSavedScenes,
  saveScene,
  saveSceneIncrementally,
  tryKeepaliveSceneSave,
} from "./scene-api";
export {
  ProjectSectionConflictError,
  fetchProject,
  fetchProjectDocument,
  saveProject,
  saveProjectSection,
} from "./project-api";
export type { ProjectDocument, ProjectFile } from "./project-api";
export type {
  SavedScene,
  SavedSceneDocument,
  SavedSceneSummary,
  SceneSaveResult,
} from "./scene-api";

type ApiResponse<T> = T & { status: string; message?: string };

async function postJson<T>(path: string, body: object): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as ApiResponse<T>;
  if (!response.ok || data.status !== "ok") {
    throw new Error(data.message || `${path} failed`);
  }
  return data;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const data = (await response.json()) as ApiResponse<T>;
  if (!response.ok || data.status !== "ok") {
    throw new Error(data.message || `${path} failed`);
  }
  return data;
}


export async function listHdris(): Promise<AssetLibraryAsset[]> {
  const data = await getJson<{ hdris: AssetLibraryAsset[] }>("/api/hdri");
  return data.hdris;
}

export async function uploadHdri(file: File): Promise<AssetLibraryAsset & { reused?: boolean }> {
  const response = await fetch(`/api/hdri?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    body: file,
  });
  const data = (await response.json()) as {
    status: string;
    message?: string;
    hdri: AssetLibraryAsset & { reused?: boolean };
  };
  if (!response.ok || data.status !== "ok") {
    throw new Error(data.message || "HDRI upload failed");
  }
  return data.hdri;
}

export async function deleteHdri(filename: string): Promise<void> {
  const response = await fetch(`/api/hdri?filename=${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
  const data = (await response.json()) as { status: string; message?: string };
  if (!response.ok || data.status !== "ok") {
    throw new Error(data.message || "HDRI delete failed");
  }
}

export async function duplicateHdri(filename: string): Promise<AssetLibraryAsset> {
  const data = await postJson<{ hdri: AssetLibraryAsset }>(
    `/api/hdri/duplicate?filename=${encodeURIComponent(filename)}`,
    {},
  );
  return data.hdri;
}

export async function revealHdri(filename: string): Promise<void> {
  await postJson(`/api/hdri/reveal?filename=${encodeURIComponent(filename)}`, {});
}
