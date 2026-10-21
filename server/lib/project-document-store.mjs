import path from "node:path";
import {
  DocumentConflictError,
  documentRevision,
  readJsonDocument,
  serializeJsonDocument,
  writeJsonDocument,
} from "./json-document-store.mjs";

export const PROJECT_DOCUMENT_VERSION = "braze-engine/project-v1";
const writeQueues = new Map();

export class ProjectSectionConflictError extends Error {
  constructor(section, expectedRevision, actualRevision) {
    super(`Project section '${section}' changed since it was loaded. Reload before saving again.`);
    this.name = "ProjectSectionConflictError";
    this.section = section;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

function validateProjectObject(project, label = "Project document") {
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return project;
}

function normalizeProjectDocument(project) {
  const source = validateProjectObject(project);
  if (
    source.version !== undefined
    && source.version !== PROJECT_DOCUMENT_VERSION
  ) {
    throw new Error(`Unsupported project document version '${String(source.version)}'`);
  }

  // A short-lived client/server mismatch wrote the request envelope itself
  // into legacy project.json files. Recover the intended section changes when
  // both envelope fields are present, then keep transport metadata out of the
  // authored project contract.
  const leakedPatch = source.version === undefined
    && source.patch
    && typeof source.patch === "object"
    && !Array.isArray(source.patch)
    && source.expectedSectionRevisions
    && typeof source.expectedSectionRevisions === "object"
    && !Array.isArray(source.expectedSectionRevisions)
      ? source.patch
      : null;
  const normalized = { ...source, ...(leakedPatch ?? {}) };
  if (leakedPatch) {
    delete normalized.patch;
    delete normalized.expectedSectionRevisions;
  }
  normalized.version = PROJECT_DOCUMENT_VERSION;
  return normalized;
}

export function projectSectionRevisions(project) {
  const revisions = {};
  for (const [section, value] of Object.entries(project)) {
    if (section === "updatedAt") continue;
    revisions[section] = documentRevision(serializeJsonDocument(value));
  }
  return revisions;
}

function enqueueProjectWrite(filePath, operation) {
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  const settled = next.then(() => undefined, () => undefined);
  writeQueues.set(filePath, settled);
  void settled.finally(() => {
    if (writeQueues.get(filePath) === settled) writeQueues.delete(filePath);
  });
  return next;
}

export async function readProjectDocument({ filePath, legacyFilePath }) {
  let document = await readJsonDocument(filePath);
  let source = filePath;
  if (!document && legacyFilePath && legacyFilePath !== filePath) {
    document = await readJsonDocument(legacyFilePath);
    source = legacyFilePath;
  }
  if (!document) {
    const value = { version: PROJECT_DOCUMENT_VERSION };
    return { value, revision: null, sectionRevisions: projectSectionRevisions(value), source: null };
  }
  const value = normalizeProjectDocument(document.value);
  return {
    ...document,
    value,
    source,
    sectionRevisions: projectSectionRevisions(value),
  };
}

export async function updateProjectDocument({
  filePath,
  legacyFilePath,
  backupDirectory,
  patch,
  expectedSectionRevisions = {},
}) {
  validateProjectObject(patch, "Project patch");
  validateProjectObject(expectedSectionRevisions, "Expected section revisions");
  const writablePatch = { ...patch };
  delete writablePatch.updatedAt;
  delete writablePatch.version;

  return enqueueProjectWrite(filePath, async () => {
    const current = await readProjectDocument({ filePath, legacyFilePath });
    for (const section of Object.keys(writablePatch)) {
      const expected = expectedSectionRevisions[section];
      if (expected === undefined) continue;
      const actual = current.sectionRevisions[section] ?? null;
      if (expected !== actual) throw new ProjectSectionConflictError(section, expected, actual);
    }

    const next = {
      ...current.value,
      ...writablePatch,
      version: PROJECT_DOCUMENT_VERSION,
    };
    const { updatedAt: _currentUpdatedAt, ...currentContent } = current.value;
    const { updatedAt: _nextUpdatedAt, ...nextContent } = next;
    if (JSON.stringify(currentContent) === JSON.stringify(nextContent)) return current;
    next.updatedAt = new Date().toISOString();

    const expectedRevision = current.source === filePath ? current.revision : null;
    const written = await writeJsonDocument({
      filePath,
      value: next,
      expectedRevision,
      backupDirectory,
    });
    return {
      value: next,
      revision: written.revision,
      sectionRevisions: projectSectionRevisions(next),
      source: filePath,
    };
  }).catch((error) => {
    if (error instanceof DocumentConflictError) {
      throw new Error("Project write serialization failed; retry the update");
    }
    throw error;
  });
}

export function projectBackupDirectory(backupsRoot) {
  return path.join(backupsRoot, "project");
}
