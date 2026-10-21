import { createSceneDocumentPatch } from "../scene/serialization/scene-delta";
import type { SceneDocumentV1 } from "../scene/serialization/scene-document";

export type SavedScene = {
  name?: string;
  version?: string;
  lightingAuthoringVersion?: number;
  savedAt?: string;
  objects: unknown[];
  camera?: unknown;
  activeObjectId?: string | null;
  activeCameraId?: string | null;
  environment?: unknown;
  physics?: unknown;
  timeline?: unknown;
  animation?: unknown;
};

type SceneApiResponse = {
  status: string;
  message?: string;
  scene?: SavedScene | null;
  revision?: string | null;
  actualRevision?: string | null;
  savedAt?: string;
};

export type SavedSceneDocument = {
  scene: SavedScene | null;
  revision: string | null;
};

export type SceneSaveResult = {
  revision: string;
  savedAt: string | null;
};

export type SavedSceneSummary = {
  name?: string;
  objectCount?: number;
  id: string;
  revision: string;
  savedAt: string | null;
  sizeBytes: number;
};

export class SceneSaveConflictError extends Error {
  readonly actualRevision: string | null;

  constructor(message: string, actualRevision: string | null) {
    super(message);
    this.name = "SceneSaveConflictError";
    this.actualRevision = actualRevision;
  }
}

function scenePath(id: string): string {
  return `/api/scenes/${encodeURIComponent(id)}`;
}

export async function fetchSavedSceneDocument(id = "current"): Promise<SavedSceneDocument> {
  const response = await fetch(scenePath(id));
  const data = (await response.json()) as SceneApiResponse;
  if (!response.ok || data.status !== "ok") {
    throw new Error(data.message || "Scene load failed");
  }
  return {
    scene: data.scene ?? null,
    revision: typeof data.revision === "string" ? data.revision : null,
  };
}

export async function fetchSavedScene(): Promise<SavedScene | null> {
  return (await fetchSavedSceneDocument()).scene;
}

export async function saveScene(
  scene: SavedScene,
  baseRevision: string | null,
  id = "current",
): Promise<SceneSaveResult> {
  const response = await fetch(scenePath(id), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene, baseRevision }),
  });
  const data = (await response.json()) as SceneApiResponse;
  if (response.status === 409) {
    throw new SceneSaveConflictError(
      data.message || "Scene changed in another editor session",
      typeof data.actualRevision === "string" ? data.actualRevision : null,
    );
  }
  if (!response.ok || data.status !== "ok" || typeof data.revision !== "string") {
    throw new Error(data.message || "Scene save failed");
  }
  return {
    revision: data.revision,
    savedAt: typeof data.savedAt === "string" ? data.savedAt : null,
  };
}

export async function saveSceneIncrementally(
  scene: SceneDocumentV1,
  previousScene: SceneDocumentV1 | null,
  baseRevision: string | null,
  id = "current",
): Promise<SceneSaveResult> {
  if (!previousScene || !baseRevision) return saveScene(scene, baseRevision, id);
  const patch = createSceneDocumentPatch(previousScene, scene);
  if (!patch) return { revision: baseRevision, savedAt: scene.savedAt ?? null };

  const deltaBody = JSON.stringify({ patch, baseRevision });
  const fullBody = JSON.stringify({ scene, baseRevision });
  if (deltaBody.length >= fullBody.length) return saveScene(scene, baseRevision, id);

  const response = await fetch(scenePath(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: deltaBody,
  });
  const data = (await response.json()) as SceneApiResponse;
  if (response.status === 409) {
    throw new SceneSaveConflictError(
      data.message || "Scene changed in another editor session",
      typeof data.actualRevision === "string" ? data.actualRevision : null,
    );
  }
  if (!response.ok || data.status !== "ok" || typeof data.revision !== "string") {
    throw new Error(data.message || "Incremental scene save failed");
  }
  return {
    revision: data.revision,
    savedAt: typeof data.savedAt === "string" ? data.savedAt : null,
  };
}

export async function listSavedScenes(): Promise<SavedSceneSummary[]> {
  const response = await fetch("/api/scenes");
  const data = (await response.json()) as {
    status: string;
    message?: string;
    scenes?: SavedSceneSummary[];
  };
  if (!response.ok || data.status !== "ok" || !Array.isArray(data.scenes)) {
    throw new Error(data.message || "Scene list failed");
  }
  return data.scenes;
}

// Fetch keepalive requests share a small browser-managed body budget (roughly
// 64 KiB). Leave headroom for implementation variance and only attempt the
// teardown flush when the complete request is safely below that ceiling.
const SCENE_KEEPALIVE_MAX_BYTES = 60 * 1024;

export function canKeepaliveSceneSave(scene: SavedScene, baseRevision: string | null): boolean {
  return keepaliveBodyFits(sceneSaveRequestBody(scene, baseRevision));
}

export function tryKeepaliveSceneSave(scene: SavedScene, baseRevision: string | null, id = "current"): boolean {
  const body = sceneSaveRequestBody(scene, baseRevision);
  if (!keepaliveBodyFits(body)) return false;
  void fetch(scenePath(id), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
  return true;
}

function sceneSaveRequestBody(scene: SavedScene, baseRevision: string | null): string {
  return JSON.stringify({ scene, baseRevision });
}

function keepaliveBodyFits(body: string): boolean {
  return new Blob([body]).size <= SCENE_KEEPALIVE_MAX_BYTES;
}

/** Revision-checked, recoverable project scene deletion. */
export async function deleteSavedScene(id: string, baseRevision: string): Promise<{ trashId: string }> {
  const response = await fetch(scenePath(id), { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseRevision }) });
  const data = await response.json() as SceneApiResponse & { trashId?: string };
  if (response.status === 409) throw new SceneSaveConflictError(data.message || "Scene changed before deletion", data.actualRevision ?? null);
  if (!response.ok || data.status !== "ok" || typeof data.trashId !== "string") throw new Error(data.message || "Scene deletion failed");
  return { trashId: data.trashId };
}
