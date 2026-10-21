import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import {
  copyFilename,
  describeIndexedAsset,
  enrichLibraryAsset,
  listAssets,
} from "../lib/assets/library-asset-records.mjs";
import { readJsonBody, sendError, sendJson } from "../lib/http.mjs";
import { ensureAssetMeta, updateAssetMeta } from "../lib/asset-index.mjs";
import { ASSETS_ROOT, TRASH_ROOT, safeAssetPath } from "../lib/paths.mjs";

export { enrichLibraryAsset };
export { handleAssetUpload } from "./source-upload.mjs";

function cleanRelativePath(value) {
  const parts = String(value || "")
    .replaceAll("\\", "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => part.replace(/[\u0000-\u001f]/g, "").trim())
    .filter(Boolean);
  if (parts.length === 0) return "asset.bin";
  return parts.join("/");
}

function requiredRelativePath(value, label) {
  if (!String(value || "").trim()) throw new Error(`Missing ${label}`);
  return cleanRelativePath(value);
}

async function moveSourceAndMeta(source, target) {
  const sourceMeta = `${source}.braze.meta`;
  const targetMeta = `${target}.braze.meta`;
  await mkdir(path.dirname(target), { recursive: true });
  let sourceMoved = false;
  try {
    await rename(source, target);
    sourceMoved = true;
    if (existsSync(sourceMeta)) await rename(sourceMeta, targetMeta);
  } catch (error) {
    if (sourceMoved && existsSync(target) && !existsSync(source)) {
      await mkdir(path.dirname(source), { recursive: true });
      await rename(target, source);
    }
    throw error;
  }
}

export async function handleAssetMove(req, res) {
  if (req.method !== "POST" && req.method !== "PATCH") {
    sendJson(res, 405, { status: "error", message: "Method not allowed" });
    return;
  }
  try {
    const body = await readJsonBody(req, 256 * 1024);
    const from = requiredRelativePath(body.filename || body.from, "filename");
    const to = requiredRelativePath(body.to || body.destination, "destination");
    if (from === to) {
      sendJson(res, 200, { status: "ok", asset: await describeIndexedAsset(to), moved: false });
      return;
    }
    const source = safeAssetPath(path.join("3d-models", from));
    const target = safeAssetPath(path.join("3d-models", to));
    if (!existsSync(source)) throw new Error("asset not found");
    if (existsSync(target)) throw new Error("destination already exists");
    await moveSourceAndMeta(source, target);
    sendJson(res, 200, { status: "ok", asset: await describeIndexedAsset(to), moved: true });
  } catch (error) {
    sendError(res, 400, error);
  }
}

export async function handleAssetFolder(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { status: "error", message: "Method not allowed" });
    return;
  }
  try {
    const body = await readJsonBody(req, 64 * 1024);
    const folder = requiredRelativePath(body.path || body.folder, "folder path");
    const absolute = safeAssetPath(path.join("3d-models", folder));
    await mkdir(absolute, { recursive: true });
    sendJson(res, 200, { status: "ok", folder });
  } catch (error) {
    sendError(res, 400, error);
  }
}

export async function handleAssetList(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { status: "error", message: "Method not allowed" });
    return;
  }
  try {
    sendJson(res, 200, { status: "ok", assets: await listAssets() });
  } catch (error) {
    sendError(res, 400, error);
  }
}

export async function handleAssetDelete(req, res, port) {
  if (req.method !== "DELETE") {
    sendJson(res, 405, { status: "error", message: "Method not allowed" });
    return;
  }
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const filename = url.searchParams.get("filename");
    if (!filename) throw new Error("Missing ?filename=");
    const absolute = safeAssetPath(path.join("3d-models", filename));
    if (!existsSync(absolute)) {
      sendJson(res, 404, { status: "error", message: "asset not found" });
      return;
    }
    const trashRun = new Date().toISOString().replace(/[:.]/g, "-");
    const trashedSource = path.join(TRASH_ROOT, trashRun, filename);
    const sourceMeta = `${absolute}.braze.meta`;
    const trashedMeta = `${trashedSource}.braze.meta`;
    await mkdir(path.dirname(trashedSource), { recursive: true });
    let sourceMoved = false;
    try {
      await rename(absolute, trashedSource);
      sourceMoved = true;
      if (existsSync(sourceMeta)) await rename(sourceMeta, trashedMeta);
    } catch (error) {
      if (sourceMoved && existsSync(trashedSource) && !existsSync(absolute)) {
        await mkdir(path.dirname(absolute), { recursive: true });
        await rename(trashedSource, absolute);
      }
      throw error;
    }
    sendJson(res, 200, { status: "ok", deleted: filename, recoverable: true });
  } catch (error) {
    sendError(res, 400, error);
  }
}

export async function handleAssetDuplicate(req, res, port) {
  if (req.method !== "POST") {
    sendJson(res, 405, { status: "error", message: "Method not allowed" });
    return;
  }
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const filename = url.searchParams.get("filename");
    if (!filename) throw new Error("Missing ?filename=");
    const source = safeAssetPath(path.join("3d-models", filename));
    if (!existsSync(source)) {
      sendJson(res, 404, { status: "error", message: "asset not found" });
      return;
    }
    const nextFilename = copyFilename(filename);
    await copyFile(source, path.join(ASSETS_ROOT, nextFilename));
    const sourceMeta = await ensureAssetMeta(source);
    await ensureAssetMeta(path.join(ASSETS_ROOT, nextFilename));
    await updateAssetMeta(path.join(ASSETS_ROOT, nextFilename), {
      importer: sourceMeta.meta.importer,
      labels: sourceMeta.meta.labels,
      foreignIds: {},
    });
    sendJson(res, 200, { status: "ok", asset: await describeIndexedAsset(nextFilename) });
  } catch (error) {
    sendError(res, 400, error);
  }
}

export function handleAssetReveal(req, res, port) {
  if (req.method !== "POST") {
    sendJson(res, 405, { status: "error", message: "Method not allowed" });
    return;
  }
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const filename = url.searchParams.get("filename");
    if (!filename) throw new Error("Missing ?filename=");
    const absolute = safeAssetPath(path.join("3d-models", filename));
    if (!existsSync(absolute)) {
      sendJson(res, 404, { status: "error", message: "asset not found" });
      return;
    }
    const command =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    const args =
      process.platform === "darwin"
        ? ["-R", absolute]
        : process.platform === "win32"
          ? [absolute]
          : [path.dirname(absolute)];
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
    sendJson(res, 200, { status: "ok" });
  } catch (error) {
    sendError(res, 400, error);
  }
}
