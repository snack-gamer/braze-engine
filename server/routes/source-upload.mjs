import path from "node:path";
import { describeIndexedAsset } from "../lib/assets/library-asset-records.mjs";
import { writeImportedSource } from "../lib/assets/source-import-writer.mjs";
import { sendError, sendJson } from "../lib/http.mjs";
import { ASSETS_ROOT } from "../lib/paths.mjs";

/** Manual file/folder import and local agent import publish through one owner. */
export async function handleAssetUpload(req, res, port, overrides = {}) {
  if (req.method !== "POST") { sendJson(res, 405, { status: "error", message: "Method not allowed" }); return; }
  const services = { root: ASSETS_ROOT, writeImportedSource, describeIndexedAsset, ...overrides };
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const name = url.searchParams.get("name") || "asset.bin";
    const folder = url.searchParams.get("folder"), relativePath = url.searchParams.get("path");
    const destination = [folder, relativePath || path.basename(name)].filter(Boolean).join("/");
    const imported = await services.writeImportedSource({ root: services.root, destination,
      unique: !folder && !relativePath, openSource: () => req });
    sendJson(res, 200, { status: "ok", asset: { ...(await services.describeIndexedAsset(imported.filename)),
      sourceRevision: imported.sourceRevision, assetRef: imported.assetRef, reused: false } });
  } catch (error) { sendError(res, 400, error); }
}
