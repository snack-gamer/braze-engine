import path from "node:path";
import { existingSourcePath } from "./assets/source-import-paths.mjs";
import {
  DocumentConflictError,
  readJsonDocument,
  writeJsonDocument,
} from "./json-document-store.mjs";

export const PREFAB_DOCUMENT_VERSION = "braze/prefab-v1";
export const LEGACY_PREFAB_DOCUMENT_VERSION = "tgan/prefab-v1";
export const PREFAB_CANONICAL_EXT = ".braze-prefab.json";
export const PREFAB_LEGACY_EXT = ".tganprefab.json";
export const PREFAB_EXT = /\.(?:braze-prefab|tganprefab)\.json$/i;

const writeQueues = new Map();

export class PrefabNotFoundError extends Error {
  constructor(filename) {
    super(`Prefab '${filename}' was not found`);
    this.name = "PrefabNotFoundError";
    this.filename = filename;
  }
}

export function validatePrefabDocument(prefab) {
  if (!prefab || typeof prefab !== "object" || Array.isArray(prefab)) {
    throw new Error("Prefab must be a JSON object");
  }
  if (
    prefab.version !== undefined
    && prefab.version !== PREFAB_DOCUMENT_VERSION
    && prefab.version !== LEGACY_PREFAB_DOCUMENT_VERSION
  ) {
    throw new Error(`Unsupported prefab document version '${String(prefab.version)}'`);
  }
  if (!Array.isArray(prefab.objects) || prefab.objects.length === 0) {
    throw new Error("Prefab must include at least one object");
  }
  const ids = new Set();
  for (const [index, object] of prefab.objects.entries()) {
    if (!object || typeof object !== "object" || Array.isArray(object)) {
      throw new Error(`Prefab object ${index} must be a JSON object`);
    }
    if (typeof object.id !== "string" || !object.id.trim()) {
      throw new Error(`Prefab object ${index} must declare a non-empty id`);
    }
    const id = object.id.trim();
    if (ids.has(id)) throw new Error(`Prefab contains duplicate object id ${id}`);
    ids.add(id);
  }
  return prefab;
}

function prefabLocation(root, filename) {
  const requested = String(filename || "").replaceAll("\\", "/");
  if (!requested || !PREFAB_EXT.test(requested)) {
    throw new Error("Prefab filename must end in .braze-prefab.json or .tganprefab.json");
  }
  const absoluteRoot = path.resolve(root);
  const filePath = path.resolve(absoluteRoot, requested);
  const relative = path.relative(absoluteRoot, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Prefab path must stay inside the project assets folder");
  }
  return {
    filePath,
    filename: relative.split(path.sep).join("/"),
  };
}

function canonicalPrefabDocument(prefab, name) {
  validatePrefabDocument(prefab);
  const fallbackName = String(name || prefab.name || "Prefab");
  return validatePrefabDocument({
    ...prefab,
    version: PREFAB_DOCUMENT_VERSION,
    name: prefab.name || fallbackName,
    savedAt: new Date().toISOString(),
  });
}

function enqueuePrefabWrite(filePath, operation) {
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  const settled = next.then(() => undefined, () => undefined);
  writeQueues.set(filePath, settled);
  void settled.finally(() => {
    if (writeQueues.get(filePath) === settled) writeQueues.delete(filePath);
  });
  return next;
}

function prefabBackupDirectory(backupsRoot, filename) {
  return backupsRoot ? path.join(backupsRoot, ...filename.split("/")) : undefined;
}

export async function readPrefabDocument({ root, filename }) {
  const location = prefabLocation(root, filename);
  const document = await readJsonDocument(location.filePath);
  if (!document) return null;
  validatePrefabDocument(document.value);
  return { ...document, ...location };
}

export async function createPrefabDocument({
  root,
  backupsRoot,
  filename,
  name,
  prefab,
  backupLimit = 8,
}) {
  const location = prefabLocation(root, filename);
  const value = canonicalPrefabDocument(prefab, name);
  return enqueuePrefabWrite(location.filePath, async () => {
    if (await existingSourcePath(`${location.filePath}.braze.meta`)) throw new Error("Prefab destination already has asset metadata. Choose a new filename to preserve its identity.");
    const written = await writeJsonDocument({
      filePath: location.filePath,
      value,
      expectedRevision: null,
      backupDirectory: prefabBackupDirectory(backupsRoot, location.filename),
      backupLimit,
    });
    return { ...written, value, ...location };
  });
}

export async function writePrefabDocument({
  root,
  backupsRoot,
  filename,
  name,
  prefab,
  expectedRevision,
  expectedGuid,
  backupLimit = 8,
}) {
  const location = prefabLocation(root, filename);
  const value = canonicalPrefabDocument(prefab, name);
  return enqueuePrefabWrite(location.filePath, async () => {
    if (expectedGuid !== undefined) {
      const metadata = await readJsonDocument(`${location.filePath}.braze.meta`);
      if (metadata?.value?.guid?.toLowerCase() !== expectedGuid.toLowerCase()
        || metadata.value.importer?.id !== "braze.prefab") throw new Error("Prefab asset identity changed. Inspect again before editing.");
    }
    const current = await readJsonDocument(location.filePath);
    if (!current) throw new PrefabNotFoundError(location.filename);
    if (expectedRevision !== current.revision) {
      throw new DocumentConflictError(expectedRevision, current.revision);
    }
    validatePrefabDocument(current.value);
    const written = await writeJsonDocument({
      filePath: location.filePath,
      value,
      expectedRevision: current.revision,
      backupDirectory: prefabBackupDirectory(backupsRoot, location.filename),
      backupLimit,
    });
    return { ...written, value, ...location };
  });
}
