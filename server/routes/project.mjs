import { readJsonBody, sendError, sendJson } from "../lib/http.mjs";
import { BACKUPS_ROOT, LEGACY_PROJECT_FILE, PROJECT_FILE } from "../lib/paths.mjs";
import {
  ProjectSectionConflictError,
  projectBackupDirectory,
  readProjectDocument,
  updateProjectDocument,
} from "../lib/project-document-store.mjs";

export function validateProjectUpdateRequest(body) {
  if (
    !body
    || typeof body !== "object"
    || Array.isArray(body)
    || !body.patch
    || typeof body.patch !== "object"
    || Array.isArray(body.patch)
    || !body.expectedSectionRevisions
    || typeof body.expectedSectionRevisions !== "object"
    || Array.isArray(body.expectedSectionRevisions)
  ) {
    throw new Error("Expected body { patch: {...}, expectedSectionRevisions: {...} }");
  }
  for (const section of Object.keys(body.patch)) {
    if (section === "version" || section === "updatedAt") continue;
    if (!Object.prototype.hasOwnProperty.call(body.expectedSectionRevisions, section)) {
      throw new Error(`Missing expected revision for project section '${section}'`);
    }
    const revision = body.expectedSectionRevisions[section];
    if (revision !== null && typeof revision !== "string") {
      throw new Error(`Expected revision for project section '${section}' must be a string or null`);
    }
  }
  return body;
}

export async function handleProjectRoute(req, res) {
  try {
    if (req.method === "GET") {
      const document = await readProjectDocument({
        filePath: PROJECT_FILE,
        legacyFilePath: LEGACY_PROJECT_FILE,
      });
      sendJson(res, 200, {
        status: "ok",
        project: document.value,
        revision: document.revision,
        sectionRevisions: document.sectionRevisions,
      });
      return;
    }

    if (req.method === "PUT") {
      const body = validateProjectUpdateRequest(await readJsonBody(req, 8 * 1024 * 1024));
      const { patch, expectedSectionRevisions } = body;
      const document = await updateProjectDocument({
        filePath: PROJECT_FILE,
        legacyFilePath: LEGACY_PROJECT_FILE,
        backupDirectory: projectBackupDirectory(BACKUPS_ROOT),
        patch,
        expectedSectionRevisions,
      });
      sendJson(res, 200, {
        status: "ok",
        project: document.value,
        revision: document.revision,
        sectionRevisions: document.sectionRevisions,
      });
      return;
    }

    sendJson(res, 405, { status: "error", message: "Method not allowed" });
  } catch (error) {
    if (error instanceof ProjectSectionConflictError) {
      sendJson(res, 409, {
        status: "conflict",
        message: error.message,
        section: error.section,
        expectedRevision: error.expectedRevision,
        actualRevision: error.actualRevision,
      });
      return;
    }
    sendError(res, 400, error);
  }
}
