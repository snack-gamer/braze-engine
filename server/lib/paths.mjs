import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { resolveProjectRoot } from "../../scripts/lib/project-root.mjs";

export const ROOT = path.resolve(process.env.BRAZE_ENGINE_ROOT || process.cwd());

// The default scratch project stays out of engine source and version control.
export const PROJECT_ROOT = resolveProjectRoot(ROOT);
export const PROJECT_CONFIG_FILE = path.join(PROJECT_ROOT, "braze.project.json");

let projectConfig = {};
if (existsSync(PROJECT_CONFIG_FILE)) {
  try {
    projectConfig = JSON.parse(readFileSync(PROJECT_CONFIG_FILE, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${PROJECT_CONFIG_FILE}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function configuredProjectPath(key, fallback) {
  const configured = typeof projectConfig[key] === "string" ? projectConfig[key] : fallback;
  const absolute = path.resolve(PROJECT_ROOT, configured);
  const relative = path.relative(PROJECT_ROOT, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${key} must stay inside the Braze project root`);
  }
  return absolute;
}

export const PAYLOAD_ROOT = path.join(ROOT, "payloads");
export const ASSETS_ROOT = configuredProjectPath("assetsPath", "assets");
export const LIBRARY_ROOT = configuredProjectPath("libraryPath", path.join(".braze", "Library"));
export const BACKUPS_ROOT = path.join(PROJECT_ROOT, ".braze", "Backups");
export const TRASH_ROOT = path.join(PROJECT_ROOT, ".braze", "Trash");
export const ENGINE_ASSETS_ROOT = path.join(ROOT, "3d-models");
export const HDRI_ROOT = path.join(ROOT, "hdri");
export const SCENES_ROOT = configuredProjectPath("scenesPath", "scenes");
export const LEGACY_SCENES_ROOT = SCENES_ROOT;
export const PROJECT_FILE = configuredProjectPath("projectFile", "project.json");
export const LEGACY_PROJECT_FILE = PROJECT_FILE;

function safeChildPath(root, label, value, publicPrefix = "") {
  const normalized = String(value || "").replaceAll("\\", "/");
  const prefix = publicPrefix ? `${publicPrefix}/` : "";
  const raw = prefix && normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
  const absolute = path.resolve(root, raw);
  const rel = path.relative(root, absolute);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path must stay inside ${label}/`);
  }
  return absolute;
}

export function safePayloadPath(value) {
  return safeChildPath(PAYLOAD_ROOT, "payloads", value, "payloads");
}

export function safeAssetPath(value) {
  return safeChildPath(ASSETS_ROOT, "assets", value, "3d-models");
}

export function safeEngineAssetPath(value) {
  return safeChildPath(ENGINE_ASSETS_ROOT, "engine assets", value, "3d-models");
}

export function safeHdriPath(value) {
  return safeChildPath(HDRI_ROOT, "hdri", value, "hdri");
}

export function relativeToRoot(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, "/");
}

export function fileUrl(filePath) {
  return `/${relativeToRoot(filePath)}`;
}

export function projectAssetPath(filePath) {
  const rel = path.relative(ASSETS_ROOT, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Asset path must stay inside the project assets folder");
  }
  return rel.replaceAll(path.sep, "/");
}

export function projectAssetUrl(relativePath) {
  const encoded = String(relativePath || "")
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `/3d-models/${encoded}`;
}

export function runId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".json") return "application/json";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  if (ext === ".glb") return "model/gltf-binary";
  if (ext === ".gltf") return "model/gltf+json";
  if (ext === ".fbx") return "application/octet-stream";
  if (ext === ".usdz") return "model/vnd.usdz+zip";
  if (ext === ".usd") return "model/vnd.usd";
  if (ext === ".hdr") return "image/vnd.radiance";
  if (ext === ".exr") return "image/x-exr";
  return "application/octet-stream";
}
