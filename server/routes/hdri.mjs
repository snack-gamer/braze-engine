import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { copyFile, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeName } from "../lib/encoding.mjs";
import { sendError, sendJson } from "../lib/http.mjs";
import { HDRI_ROOT, fileUrl, relativeToRoot, safeHdriPath } from "../lib/paths.mjs";

const MAX_BYTES = 250 * 1024 * 1024;
const ACCEPTED = /\.(hdr|exr)$/i;

function describeHdri(filename) {
  const absolute = path.join(HDRI_ROOT, filename);
  if (!existsSync(absolute)) return null;
  const stats = statSync(absolute);
  if (!stats.isFile()) return null;
  return {
    filename,
    name: filename,
    path: relativeToRoot(absolute),
    url: fileUrl(absolute),
    sizeBytes: stats.size,
    updatedAt: stats.mtime.toISOString(),
  };
}

function listHdris() {
  if (!existsSync(HDRI_ROOT)) return [];
  return readdirSync(HDRI_ROOT)
    .filter((name) => !name.startsWith(".") && ACCEPTED.test(name))
    .map((name) => describeHdri(name))
    .filter((hdri) => hdri !== null)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

function copyFilename(filename) {
  const ext = path.extname(filename);
  const stem = safeName(path.basename(filename, ext));
  let candidate = `${stem}-copy${ext}`;
  let index = 2;
  while (existsSync(path.join(HDRI_ROOT, candidate))) {
    candidate = `${stem}-copy-${index}${ext}`;
    index += 1;
  }
  return candidate;
}

export async function handleHdriUpload(req, res, port) {
  if (req.method !== "POST") {
    sendJson(res, 405, { status: "error", message: "Method not allowed" });
    return;
  }
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const rawName = url.searchParams.get("name") || "env.hdr";
    const ext = path.extname(rawName).toLowerCase();
    if (!/\.(hdr|exr)$/.test(ext)) {
      throw new Error("Only .hdr and .exr files are accepted");
    }
    const stem = safeName(path.basename(rawName, ext));

    const chunks = [];
    let received = 0;
    await new Promise((resolve, reject) => {
      req.on("data", (chunk) => {
        received += chunk.length;
        if (received > MAX_BYTES) {
          req.destroy();
          reject(new Error(`Upload exceeded ${MAX_BYTES} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      req.on("error", reject);
      req.on("end", resolve);
    });

    const buffer = Buffer.concat(chunks);
    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 12);
    const filename = `${stem}-${hash}${ext}`;
    const absolute = path.join(HDRI_ROOT, filename);
    await mkdir(HDRI_ROOT, { recursive: true });

    let reused = false;
    if (existsSync(absolute)) {
      reused = true;
    } else {
      await writeFile(absolute, buffer);
    }

    sendJson(res, 200, {
      status: "ok",
      hdri: { ...describeHdri(filename), reused },
    });
  } catch (error) {
    sendError(res, 400, error);
  }
}

export function handleHdriList(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { status: "error", message: "Method not allowed" });
    return;
  }
  try {
    sendJson(res, 200, { status: "ok", hdris: listHdris() });
  } catch (error) {
    sendError(res, 400, error);
  }
}

export async function handleHdriDelete(req, res, port) {
  if (req.method !== "DELETE") {
    sendJson(res, 405, { status: "error", message: "Method not allowed" });
    return;
  }
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const filename = url.searchParams.get("filename");
    if (!filename) throw new Error("Missing ?filename=");
    const absolute = safeHdriPath(path.join("hdri", filename));
    if (!existsSync(absolute)) {
      sendJson(res, 404, { status: "error", message: "hdri not found" });
      return;
    }
    await unlink(absolute);
    sendJson(res, 200, { status: "ok", deleted: filename });
  } catch (error) {
    sendError(res, 400, error);
  }
}

export async function handleHdriDuplicate(req, res, port) {
  if (req.method !== "POST") {
    sendJson(res, 405, { status: "error", message: "Method not allowed" });
    return;
  }
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const filename = url.searchParams.get("filename");
    if (!filename) throw new Error("Missing ?filename=");
    const source = safeHdriPath(path.join("hdri", filename));
    if (!existsSync(source)) {
      sendJson(res, 404, { status: "error", message: "hdri not found" });
      return;
    }
    const nextFilename = copyFilename(filename);
    await copyFile(source, path.join(HDRI_ROOT, nextFilename));
    sendJson(res, 200, { status: "ok", hdri: describeHdri(nextFilename) });
  } catch (error) {
    sendError(res, 400, error);
  }
}

export function handleHdriReveal(req, res, port) {
  if (req.method !== "POST") {
    sendJson(res, 405, { status: "error", message: "Method not allowed" });
    return;
  }
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const filename = url.searchParams.get("filename");
    if (!filename) throw new Error("Missing ?filename=");
    const absolute = safeHdriPath(path.join("hdri", filename));
    if (!existsSync(absolute)) {
      sendJson(res, 404, { status: "error", message: "hdri not found" });
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
