import { createReadStream, existsSync, statSync } from "node:fs";
import { sendError, sendJson } from "../lib/http.mjs";
import {
  mimeType,
  safeAssetPath,
  safeEngineAssetPath,
  safeHdriPath,
  safePayloadPath,
} from "../lib/paths.mjs";

export function serveResolvedFile(req, res, port, resolveSafe, openReadStream = createReadStream) {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const absolute = resolveSafe(decodeURIComponent(url.pathname.slice(1)));
    const stat = existsSync(absolute) ? statSync(absolute) : null;
    if (!stat?.isFile()) {
      sendJson(res, 404, { status: "error", message: "file not found" });
      return;
    }
    const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
    const lastModified = stat.mtime.toUTCString();
    if (req.headers["if-none-match"] === etag || req.headers["if-modified-since"] === lastModified) {
      res.statusCode = 304;
      res.setHeader("ETag", etag);
      res.setHeader("Last-Modified", lastModified);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeType(absolute));
    res.setHeader("Content-Length", stat.size);
    res.setHeader("ETag", etag);
    res.setHeader("Last-Modified", lastModified);
    res.setHeader("Cache-Control", "public, max-age=3600");
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = openReadStream(absolute);
    stream.once("error", (error) => {
      if (!res.headersSent) {
        sendError(res, 500, error);
      } else if (!res.writableEnded) {
        res.destroy(error instanceof Error ? error : undefined);
      }
    });
    stream.pipe(res);
  } catch (error) {
    sendError(res, 400, error);
  }
}

export function servePayloadFile(req, res, port) {
  serveResolvedFile(req, res, port, safePayloadPath);
}

export function serveAssetFile(req, res, port) {
  // Project content owns /3d-models for backward compatibility with existing
  // scene documents. Built-in editor models remain readable as a fallback,
  // but are no longer mixed into the game's Project tree.
  serveResolvedFile(req, res, port, (value) => {
    const projectAsset = safeAssetPath(value);
    return existsSync(projectAsset) ? projectAsset : safeEngineAssetPath(value);
  });
}

export function serveHdriFile(req, res, port) {
  serveResolvedFile(req, res, port, safeHdriPath);
}
