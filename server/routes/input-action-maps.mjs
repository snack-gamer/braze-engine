import { InputActionMapNotFoundError } from "../lib/input-action-map-document-store.mjs";
import { INPUT_ACTION_MAP_ASSET_MAX_BYTES } from "../../src/input/domain/input-action-map-asset-identity.mjs";
import { createInputMapAuthoring } from "../lib/input-map-authoring.mjs";
import { readJsonBody, sendError, sendJson } from "../lib/http.mjs";
import { DocumentConflictError } from "../lib/json-document-store.mjs";
export async function handleInputActionMapRoute(req, res, port, services) {
  try {
    const authoring = createInputMapAuthoring(services);
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "no-store, max-age=0");
      sendJson(res, 200, { status: "ok", ...await authoring.inspect(url.searchParams.get("filename")) });
      return;
    }
    if (req.method !== "POST" && req.method !== "PUT") { sendJson(res, 405, { status: "error", message: "Method not allowed" }); return; }
    const body = await readJsonBody(req, INPUT_ACTION_MAP_ASSET_MAX_BYTES);
    const result = req.method === "POST" ? await authoring.create(body)
      : await authoring.save(url.searchParams.get("filename"), body);
    sendJson(res, 200, { status: "ok", ...result });
  } catch (error) {
    if (error instanceof DocumentConflictError) { sendJson(res, 409, { status: "conflict", message: error.message, expectedRevision: error.expectedRevision, actualRevision: error.actualRevision }); return; }
    if (error instanceof InputActionMapNotFoundError) { sendJson(res, 404, { status: "error", message: error.message }); return; }
    sendError(res, 400, error);
  }
}
