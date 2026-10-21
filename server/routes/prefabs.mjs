import path from "node:path";
import {
  PREFAB_CANONICAL_EXT,
  PREFAB_EXT,
  PrefabNotFoundError,
  createPrefabDocument,
  readPrefabDocument,
  writePrefabDocument,
} from "../lib/prefab-document-store.mjs";
import {
  describeIndexedAsset,
} from "../lib/assets/library-asset-records.mjs";
import { unusedSourceDestination } from "../lib/assets/source-import-paths.mjs";
import { safeName } from "../lib/encoding.mjs";
import { readJsonBody, sendError, sendJson } from "../lib/http.mjs";
import { DocumentConflictError } from "../lib/json-document-store.mjs";
import { ASSETS_ROOT, BACKUPS_ROOT } from "../lib/paths.mjs";

const PREFAB_BACKUPS_ROOT = path.join(BACKUPS_ROOT, "prefabs");
const DEFAULT_PREFAB_ROUTE_DEPENDENCIES = Object.freeze({
  root: ASSETS_ROOT,
  backupsRoot: PREFAB_BACKUPS_ROOT,
  availableFilename: (filename) => unusedSourceDestination(ASSETS_ROOT, filename),
  createPrefabDocument,
  describeIndexedAsset,
  readPrefabDocument,
  writePrefabDocument,
});

function prefabFilename(url) {
  const filename = url.searchParams.get("filename");
  if (!filename) throw new Error("Missing prefab ?filename=");
  if (!PREFAB_EXT.test(filename)) {
    throw new Error("Prefab filename must end in .braze-prefab.json or .tganprefab.json");
  }
  return filename;
}

function validateWriteBody(body, requireRevision) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !body.prefab) {
    throw new Error("Expected body { prefab: {...}, name?: string }");
  }
  if (requireRevision && !Object.prototype.hasOwnProperty.call(body, "baseRevision")) {
    throw new Error("Expected body { prefab: {...}, baseRevision: string | null }");
  }
  if (body.assetGuid !== undefined && (typeof body.assetGuid !== "string" || !/^[a-f0-9]{32}$/i.test(body.assetGuid))) throw new Error("assetGuid must be a valid prefab GUID.");
  if (
    requireRevision
    && body.baseRevision !== null
    && typeof body.baseRevision !== "string"
  ) {
    throw new Error("baseRevision must be a string or null");
  }
}

function sendPrefabConflict(res, error) {
  sendJson(res, 409, {
    status: "conflict",
    message: error.message,
    expectedRevision: error.expectedRevision,
    actualRevision: error.actualRevision,
  });
}

export async function handlePrefabRoute(
  req,
  res,
  port,
  dependencies = DEFAULT_PREFAB_ROUTE_DEPENDENCIES,
) {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      const filename = prefabFilename(url);
      const document = await dependencies.readPrefabDocument({
        root: dependencies.root,
        filename,
      });
      if (!document) {
        sendJson(res, 404, { status: "error", message: "prefab not found" });
        return;
      }
      sendJson(res, 200, {
        status: "ok",
        prefab: document.value,
        revision: document.revision,
      });
      return;
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req, 25 * 1024 * 1024);
      validateWriteBody(body, false);
      const rawName = String(body.name || body.prefab.name || "Prefab");
      const stem = safeName(rawName.replace(PREFAB_EXT, ""));
      const filename = await dependencies.availableFilename(`${stem}${PREFAB_CANONICAL_EXT}`);
      const written = await dependencies.createPrefabDocument({
        root: dependencies.root,
        backupsRoot: dependencies.backupsRoot,
        filename,
        name: rawName,
        prefab: body.prefab,
      });
      const asset = await dependencies.describeIndexedAsset(filename, written.revision);
      sendJson(res, 200, {
        status: "ok",
        asset: { ...asset, reused: false },
        revision: written.revision,
      });
      return;
    }

    if (req.method === "PUT") {
      const filename = prefabFilename(url);
      const body = await readJsonBody(req, 25 * 1024 * 1024);
      validateWriteBody(body, true);
      const written = await dependencies.writePrefabDocument({
        root: dependencies.root,
        backupsRoot: dependencies.backupsRoot,
        filename,
        name: String(body.name || body.prefab.name || "Prefab"),
        prefab: body.prefab,
        expectedRevision: body.baseRevision,
        expectedGuid: body.assetGuid,
      });
      sendJson(res, 200, {
        status: "ok",
        asset: await dependencies.describeIndexedAsset(filename, written.revision),
        revision: written.revision,
      });
      return;
    }

    sendJson(res, 405, { status: "error", message: "Method not allowed" });
  } catch (error) {
    if (error instanceof DocumentConflictError) {
      sendPrefabConflict(res, error);
      return;
    }
    if (error instanceof PrefabNotFoundError) {
      sendJson(res, 404, { status: "error", message: "prefab not found" });
      return;
    }
    sendError(res, 400, error);
  }
}
