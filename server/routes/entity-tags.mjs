import { collectEntityTagUsage } from "../lib/entity-tag-usage.mjs";
import { ASSETS_ROOT, SCENES_ROOT } from "../lib/paths.mjs";
import { sendJson, sendError } from "../lib/http.mjs";

export async function handleEntityTagUsage(req, res) {
  if (req.method !== "GET") { sendJson(res, 405, { status: "error", message: "Method not allowed" }); return; }
  try { sendJson(res, 200, { status: "ok", ...await collectEntityTagUsage({ scenesRoot: SCENES_ROOT, assetsRoot: ASSETS_ROOT }) }); }
  catch (error) { sendError(res, 400, error); }
}
