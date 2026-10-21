import { existsSync } from "node:fs";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  DocumentConflictError,
  readJsonDocument,
  writeJsonDocument,
  writeTextAtomic,
} from "./json-document-store.mjs";

const SCENE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
export const SCENE_DOCUMENT_VERSION = "braze-engine/scene-v1";
const writeQueues = new Map();

export function normalizeSceneId(value) {
  const id = String(value || "").trim();
  if (!SCENE_ID_RE.test(id) || id === "." || id === "..") {
    throw new Error("Scene id must contain only letters, numbers, dots, underscores, or hyphens");
  }
  return id;
}

export function validateSceneDocument(scene) {
  if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
    throw new Error("Scene must be a JSON object");
  }
  if (scene.version !== SCENE_DOCUMENT_VERSION) {
    throw new Error(`Scene version must be '${SCENE_DOCUMENT_VERSION}'`);
  }
  if (scene.name !== undefined && (typeof scene.name !== "string" || !scene.name.trim() || scene.name.trim().length > 128 || /[\u0000-\u001f]/.test(scene.name))) throw new Error("Invalid scene name");
  if (!Array.isArray(scene.objects)) throw new Error("Scene must contain an objects array");
  const ids = new Set();
  for (const [index, object] of scene.objects.entries()) {
    if (!object || typeof object !== "object" || Array.isArray(object)) {
      throw new Error(`Scene object ${index} must be a JSON object`);
    }
    if (typeof object.id !== "string" || !object.id.trim()) {
      throw new Error(`Scene object ${index} must declare a non-empty id`);
    }
    if (ids.has(object.id)) throw new Error(`Scene contains duplicate object id ${object.id}`);
    ids.add(object.id);
  }
  return scene;
}

function sceneObjectId(object, label) {
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    throw new Error(`${label} must be a JSON object`);
  }
  if (typeof object.id !== "string" || !object.id.trim()) {
    throw new Error(`${label} must declare a non-empty id`);
  }
  return object.id;
}

export function applySceneDocumentPatch(current, patch) {
  validateSceneDocument(current);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("Scene patch must be a JSON object");
  }
  const metadata = patch.metadata ?? {};
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Scene patch metadata must be a JSON object");
  }
  if (Object.hasOwn(metadata, "objects")) throw new Error("Scene patch metadata cannot replace objects");
  const removeMetadata = patch.removeMetadata ?? [];
  const upsertObjects = patch.upsertObjects ?? [];
  const removeObjectIds = patch.removeObjectIds ?? [];
  if (!Array.isArray(removeMetadata) || !removeMetadata.every((key) => typeof key === "string" && key !== "objects")) {
    throw new Error("removeMetadata must contain non-object field names");
  }
  if (!Array.isArray(upsertObjects)) throw new Error("upsertObjects must be an array");
  if (!Array.isArray(removeObjectIds) || !removeObjectIds.every((id) => typeof id === "string" && id)) {
    throw new Error("removeObjectIds must contain non-empty strings");
  }

  const next = { ...current, ...metadata };
  for (const key of removeMetadata) delete next[key];
  const objectById = new Map(current.objects.map((object, index) => [sceneObjectId(object, `Scene object ${index}`), object]));
  for (const id of removeObjectIds) objectById.delete(id);
  const appendedIds = [];
  for (const [index, object] of upsertObjects.entries()) {
    const id = sceneObjectId(object, `upsertObjects[${index}]`);
    if (!objectById.has(id)) appendedIds.push(id);
    objectById.set(id, object);
  }

  const order = patch.objectOrder;
  if (order !== undefined) {
    if (!Array.isArray(order) || !order.every((id) => typeof id === "string" && id)) {
      throw new Error("objectOrder must contain non-empty strings");
    }
    if (new Set(order).size !== order.length || order.length !== objectById.size) {
      throw new Error("objectOrder must contain every scene object exactly once");
    }
    next.objects = order.map((id) => {
      const object = objectById.get(id);
      if (!object) throw new Error(`objectOrder references unknown object ${id}`);
      return object;
    });
  } else {
    const retainedIds = current.objects
      .map((object, index) => sceneObjectId(object, `Scene object ${index}`))
      .filter((id) => objectById.has(id));
    next.objects = [...retainedIds, ...appendedIds].map((id) => objectById.get(id));
  }
  return validateSceneDocument(next);
}

function sceneFile(root, id) {
  return path.join(root, `${normalizeSceneId(id)}.scene.json`);
}

function enqueueSceneWrite(filePath, operation) {
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  const settled = next.then(() => undefined, () => undefined);
  writeQueues.set(filePath, settled);
  void settled.finally(() => {
    if (writeQueues.get(filePath) === settled) writeQueues.delete(filePath);
  });
  return next;
}

export async function readSceneDocument({ root, legacyRoot, id }) {
  const filePath = sceneFile(root, id);
  let document = await readJsonDocument(filePath);
  let source = filePath;
  if (!document && id === "current" && legacyRoot && !existsSync(path.join(root, ".deleted", `${id}.json`))) {
    const legacyPath = sceneFile(legacyRoot, id);
    if (legacyPath !== filePath) {
      document = await readJsonDocument(legacyPath);
      source = legacyPath;
    }
  }
  return document ? { ...document, source } : null;
}

export async function writeSceneDocument({ root, legacyRoot, backupsRoot, id, scene, expectedRevision }) {
  validateSceneDocument(scene);
  const normalizedId = normalizeSceneId(id);
  const filePath = sceneFile(root, normalizedId);
  return enqueueSceneWrite(filePath, async () => {
    const current = await readSceneDocument({ root, legacyRoot, id: normalizedId });
    const actualRevision = current?.revision ?? null;
    if (expectedRevision !== undefined && expectedRevision !== actualRevision) {
      throw new DocumentConflictError(expectedRevision, actualRevision);
    }
    const writeExpectedRevision = current?.source === filePath ? actualRevision : null;
    return writeJsonDocument({
      filePath,
      value: scene,
      expectedRevision: writeExpectedRevision,
      backupDirectory: backupsRoot ? path.join(backupsRoot, normalizedId) : undefined,
    });
  });
}

/** Shares the write queue so an old autosave cannot race deletion or recreate the file. */
export async function deleteSceneDocument({ root, legacyRoot, trashRoot, id, expectedRevision }) {
  const normalizedId = normalizeSceneId(id), filePath = sceneFile(root, normalizedId);
  if (typeof expectedRevision !== "string" || !expectedRevision) throw new Error("Deletion requires a scene revision");
  if (!trashRoot) throw new Error("Scene trash directory is unavailable");
  return enqueueSceneWrite(filePath, async () => {
    const current = await readSceneDocument({ root, legacyRoot, id: normalizedId });
    if (!current || current.revision !== expectedRevision) throw new DocumentConflictError(expectedRevision, current?.revision ?? null);
    const trashId = randomUUID(), directory = path.join(trashRoot, trashId);
    await mkdir(directory, { recursive: true });
    await writeTextAtomic(path.join(directory, "manifest.json"), JSON.stringify({ sceneId: normalizedId, revision: current.revision, deletedAt: new Date().toISOString() }));
    // Suppress legacy fallback after removal. A restored canonical file takes precedence.
    await writeTextAtomic(path.join(root, ".deleted", `${normalizedId}.json`), JSON.stringify({ trashId }));
    await rename(current.source, path.join(directory, `${normalizedId}.scene.json`));
    return { sceneId: normalizedId, trashId };
  });
}

export async function patchSceneDocument({ root, legacyRoot, backupsRoot, id, patch, expectedRevision }) {
  const normalizedId = normalizeSceneId(id);
  const filePath = sceneFile(root, normalizedId);
  return enqueueSceneWrite(filePath, async () => {
    const current = await readSceneDocument({ root, legacyRoot, id: normalizedId });
    if (!current) throw new Error(`Scene '${normalizedId}' does not exist`);
    if (expectedRevision !== current.revision) {
      throw new DocumentConflictError(expectedRevision, current.revision);
    }
    const next = applySceneDocumentPatch(current.value, patch);
    const written = await writeJsonDocument({
      filePath,
      value: next,
      expectedRevision: current.source === filePath ? current.revision : null,
      backupDirectory: backupsRoot ? path.join(backupsRoot, normalizedId) : undefined,
    });
    return { ...written, value: next };
  });
}

async function sceneSummariesInRoot(root) {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const scenes = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".scene.json")) continue;
    const id = entry.name.slice(0, -".scene.json".length);
    if (!SCENE_ID_RE.test(id)) continue;
    const filePath = path.join(root, entry.name);
    let document, fileStat;
    try { [document, fileStat] = await Promise.all([readJsonDocument(filePath), stat(filePath)]); }
    catch (error) { if (error?.code === "ENOENT") continue; throw error; }
    if (!document) continue;
    scenes.push({
      id,
      revision: document.revision,
      name: typeof document.value?.name === "string" ? document.value.name : id === "current" ? "Main Scene" : id,
      objectCount: Array.isArray(document.value?.objects) ? document.value.objects.length : 0,
      savedAt: typeof document.value?.savedAt === "string" ? document.value.savedAt : null,
      sizeBytes: fileStat.size,
    });
  }
  return scenes;
}

export async function listSceneDocuments(root, legacyRoot) {
  const scenes = await sceneSummariesInRoot(root);
  if (
    !scenes.some((scene) => scene.id === "current")
    && legacyRoot
    && !existsSync(path.join(root, ".deleted", "current.json"))
    && path.resolve(legacyRoot) !== path.resolve(root)
  ) {
    const legacyCurrent = (await sceneSummariesInRoot(legacyRoot))
      .find((scene) => scene.id === "current");
    if (legacyCurrent) scenes.push(legacyCurrent);
  }
  return scenes.sort((left, right) => left.id.localeCompare(right.id));
}
