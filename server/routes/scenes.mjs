import path from "node:path";
import { readJsonBody, sendError, sendJson } from "../lib/http.mjs";
import { DocumentConflictError } from "../lib/json-document-store.mjs";
import { BACKUPS_ROOT, TRASH_ROOT, LEGACY_SCENES_ROOT, SCENES_ROOT } from "../lib/paths.mjs";
import {
  listSceneDocuments,
  deleteSceneDocument,
  normalizeSceneId,
  patchSceneDocument,
  readSceneDocument,
  writeSceneDocument,
} from "../lib/scene-document-store.mjs";

const SCENE_BACKUPS_ROOT = path.join(BACKUPS_ROOT, "scenes");
const DEFAULT_SCENE_ROUTE_DEPENDENCIES = Object.freeze({
  backupsRoot: SCENE_BACKUPS_ROOT,
  trashRoot: path.join(TRASH_ROOT, "scenes"),
  legacyRoot: LEGACY_SCENES_ROOT,
  root: SCENES_ROOT,
  listSceneDocuments,
  deleteSceneDocument,
  patchSceneDocument,
  readSceneDocument,
  writeSceneDocument,
});

function routeSceneId(pathname) {
  const prefix = "/api/scenes/";
  if (!pathname.startsWith(prefix)) return null;
  return normalizeSceneId(decodeURIComponent(pathname.slice(prefix.length)));
}

export async function handleScenesRoute(
  req,
  res,
  pathname,
  dependencies = DEFAULT_SCENE_ROUTE_DEPENDENCIES,
) {
  try {
    if (pathname === "/api/scenes") {
      if (req.method === "GET") {
        sendJson(res, 200, {
          status: "ok",
          scenes: await dependencies.listSceneDocuments(dependencies.root, dependencies.legacyRoot),
        });
        return;
      }
      sendJson(res, 405, { status: "error", message: "Method not allowed" });
      return;
    }

    const id = routeSceneId(pathname);
    if (!id) {
      sendJson(res, 404, { status: "error", message: "Unknown scenes endpoint" });
      return;
    }
    // Await inside this try/catch. Returning a bare Promise here lets an async
    // store rejection bypass the conflict response and reach Node as an
    // unhandled request-listener rejection.
    if (req.method === "GET") {
      await getScene(res, id, dependencies);
      return;
    }
    if (req.method === "PUT") {
      await putScene(req, res, id, dependencies);
      return;
    }
    if (req.method === "DELETE") {
      const body = await readJsonBody(req, 4096);
      if (typeof body?.baseRevision !== "string" || !body.baseRevision) throw new Error("Expected body { baseRevision: string }");
      const result = await dependencies.deleteSceneDocument({ root: dependencies.root, legacyRoot: dependencies.legacyRoot,
        trashRoot: dependencies.trashRoot, id, expectedRevision: body.baseRevision });
      sendJson(res, 200, { status: "ok", ...result });
      return;
    }
    if (req.method === "PATCH") {
      await patchScene(req, res, id, dependencies);
      return;
    }
    sendJson(res, 405, { status: "error", message: "Method not allowed" });
  } catch (error) {
    if (error instanceof DocumentConflictError) {
      sendJson(res, 409, {
        status: "conflict",
        message: error.message,
        expectedRevision: error.expectedRevision,
        actualRevision: error.actualRevision,
      });
      return;
    }
    sendError(res, 400, error);
  }
}

async function getScene(res, id, dependencies) {
  const document = await dependencies.readSceneDocument({
    root: dependencies.root,
    legacyRoot: dependencies.legacyRoot,
    id,
  });
  sendJson(res, 200, {
    status: "ok",
    scene: document?.value ?? null,
    revision: document?.revision ?? null,
  });
}

async function putScene(req, res, id, dependencies) {
  const body = await readJsonBody(req, 16 * 1024 * 1024);
  if (
    !body
    || typeof body !== "object"
    || !body.scene
    || !Object.prototype.hasOwnProperty.call(body, "baseRevision")
  ) {
    throw new Error("Expected body { scene: {...}, baseRevision: string | null }");
  }
  if (body.baseRevision !== undefined && body.baseRevision !== null && typeof body.baseRevision !== "string") {
    throw new Error("baseRevision must be a string or null");
  }
  const result = await dependencies.writeSceneDocument({
    root: dependencies.root,
    legacyRoot: dependencies.legacyRoot,
    backupsRoot: dependencies.backupsRoot,
    id,
    scene: body.scene,
    expectedRevision: body.baseRevision,
  });
  sendJson(res, 200, {
    status: "ok",
    savedAt: typeof body.scene.savedAt === "string" ? body.scene.savedAt : new Date().toISOString(),
    revision: result.revision,
  });
}

async function patchScene(req, res, id, dependencies) {
  const body = await readJsonBody(req, 8 * 1024 * 1024);
  if (!body || typeof body !== "object" || !body.patch || typeof body.baseRevision !== "string") {
    throw new Error("Expected body { patch: {...}, baseRevision: string }");
  }
  const result = await dependencies.patchSceneDocument({
    root: dependencies.root,
    legacyRoot: dependencies.legacyRoot,
    backupsRoot: dependencies.backupsRoot,
    id,
    patch: body.patch,
    expectedRevision: body.baseRevision,
  });
  sendJson(res, 200, {
    status: "ok",
    savedAt: typeof result.value.savedAt === "string" ? result.value.savedAt : new Date().toISOString(),
    revision: result.revision,
  });
}
