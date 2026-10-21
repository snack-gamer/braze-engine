import path from "node:path";
import { executeBrowserCommand } from "../../scripts/lib/engine-browser-commands.mjs";
import { createPlayerExportJobs } from "../../scripts/lib/player-export-jobs.mjs";
import { createEditorSessions } from "../lib/automation/editor-sessions.mjs";
import { readJsonBody, sendJson } from "../lib/http.mjs";
import { DocumentConflictError } from "../lib/json-document-store.mjs";
import { ProjectSectionConflictError } from "../lib/project-document-store.mjs";
import { createPrefabAuthoringCommands } from "../lib/prefab-authoring-commands.mjs";
import { createInputAuthoringCommands } from "../lib/input-authoring-commands.mjs";
import { createSourceImportCommand } from "../lib/assets/source-import-command.mjs";
import { SCENES_ROOT, LEGACY_SCENES_ROOT, BACKUPS_ROOT, ROOT, PROJECT_ROOT } from "../lib/paths.mjs";
import { readSceneDocument, writeSceneDocument, listSceneDocuments } from "../lib/scene-document-store.mjs";
import { refreshAssetDatabase } from "../lib/assets/asset-database-store.mjs";
import { createAutomationService } from "../lib/automation/command-service.mjs";

export function createAutomationRoute({ loadAuthoring, loadPrefabAuthoring, loadCapabilities, ...overrides }) {
  const editors = createEditorSessions();
  const execute = createAutomationService({ root: SCENES_ROOT, legacyRoot: LEGACY_SCENES_ROOT,
    backupsRoot: path.join(BACKUPS_ROOT, "scenes"), readSceneDocument, writeSceneDocument, listSceneDocuments,
    refreshAssetDatabase, loadAuthoring, executePrefabCommand: createPrefabAuthoringCommands({ loadAuthoring: loadPrefabAuthoring }), executeInputCommand: createInputAuthoringCommands(), executeSourceImport: createSourceImportCommand(), ...overrides });
  const exports = createPlayerExportJobs({ engineRoot: ROOT, projectRoot: PROJECT_ROOT,
    readScene: (id) => readSceneDocument({ root: SCENES_ROOT, legacyRoot: LEGACY_SCENES_ROOT, id }) });
  const handle = async (req, res, pathname) => {
    let requestId = null;
    try {
      const origin = req.headers.origin;
      const host = req.headers.host;
      if (origin && new URL(origin).host !== host) { sendJson(res, 403, { status: "error", message: "Automation requires a same-origin or local CLI request." }); return; }
      if (req.method === "GET" && pathname === "/api/automation/v1/editor-events") { editors.attach(req, res); return; }
      if (req.method === "GET" && pathname === "/api/automation/v1/capabilities") {
        sendJson(res, 200, { status: "ok", ...(await loadCapabilities()) }); return;
      }
      if (req.method !== "POST" || !["/api/automation/v1/commands", "/api/automation/v1/editor-result"].includes(pathname)) { sendJson(res, 404, { status: "error", message: "Unknown automation endpoint." }); return; }
      if (req.headers["x-braze-automation"] !== "1") { sendJson(res, 403, { status: "error", message: "X-Braze-Automation: 1 is required." }); return; }
      const body = await readJsonBody(req, 4 * 1024 * 1024); requestId = body.requestId;
      if (pathname === "/api/automation/v1/editor-result") { editors.complete(body); sendJson(res, 200, { status: "ok" }); return; }
      if (body.version !== 1 || typeof body.requestId !== "string" || !body.requestId || body.requestId.length > 256) throw new Error("Expected version 1 and requestId.");
      let result;
      if (typeof body.operation === "string" && body.operation.startsWith("browser.")) {
        const controller = new AbortController(), abort = () => controller.abort();
        res.once('close', abort);
        try { result = await executeBrowserCommand(body, { engineUrl: `http://${host}`, signal: controller.signal }); }
        finally { res.removeListener('close', abort); }
      } else if (typeof body.operation === "string" && body.operation.startsWith("project.export.")) result = await exports.execute(body);
      else result = typeof body.operation === "string" && body.operation.startsWith("editor.") ? await editors.execute(body) : await execute(body);
      sendJson(res, 200, { version: 1, requestId, status: "ok", result });
    } catch (error) {
      const conflict = error instanceof DocumentConflictError || error instanceof ProjectSectionConflictError;
      sendJson(res, conflict ? 409 : 400, { version: 1, requestId, status: conflict ? "conflict" : "error",
        message: String(error instanceof Error ? error.message : error), ...(conflict ? { actualRevision: error.actualRevision, expectedRevision: error.expectedRevision } : {}),
        ...(error instanceof ProjectSectionConflictError ? { section: error.section } : {}) });
    }
  };
  handle.dispose = exports.dispose;
  return handle;
}
