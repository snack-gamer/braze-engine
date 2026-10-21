import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ensureAssetMeta, updateAssetMeta } from "./asset-index.mjs";
import {
  assertSupportedModelImportSettingsVersion,
  mergePreservedModelImportSettings,
  normalizeStoredModelImportSettings,
} from "./model-import-settings.mjs";
import { ASSETS_ROOT, BACKUPS_ROOT, safeAssetPath } from "./paths.mjs";

export {
  assertSupportedModelImportSettingsVersion,
  mergePreservedModelImportSettings,
  normalizeModelImportSettings,
  normalizeRigSettings,
  normalizeStoredModelImportSettings,
} from "./model-import-settings.mjs";

const MODEL_EXT = /\.(glb|gltf|fbx|usdz|usd)$/i;

function cleanAssetFilename(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function importRootFor(filename) {
  const clean = cleanAssetFilename(filename);
  const parts = clean.split("/");
  if (parts[0] === "imported-library" && parts[1]) return `${parts[0]}/${parts[1]}`;
  return clean;
}

function metaFilename(filename) {
  const root = importRootFor(filename);
  if (root.endsWith(".tganimport.json")) return root;
  return MODEL_EXT.test(root) ? `${root}.tganimport.json` : `${root}/.tganimport.json`;
}

function versionFor(settingsPath, sourcePath) {
  const settingsTime = existsSync(settingsPath) ? statSync(settingsPath).mtimeMs : 0;
  const sourceTime = existsSync(sourcePath) ? statSync(sourcePath).mtimeMs : 0;
  return String(Math.max(settingsTime, sourceTime));
}

export function isModelAssetFilename(filename) {
  return MODEL_EXT.test(filename);
}

export async function readModelImportDocument(filename) {
  const clean = cleanAssetFilename(filename);
  if (!MODEL_EXT.test(clean)) throw new Error("Import settings require a model asset");
  const sourcePath = safeAssetPath(path.join("3d-models", clean));
  if (!existsSync(sourcePath)) throw new Error("asset not found");
  const {
    meta,
    metaFilename: settingsPath,
    revision,
    diagnostics,
  } = await ensureAssetMeta(sourcePath);
  const metadataFailure = diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (metadataFailure) throw new Error(metadataFailure.message);
  if (typeof revision !== "string") {
    throw new Error("Asset metadata is unavailable; import settings cannot be loaded safely");
  }
  assertSupportedModelImportSettingsVersion(meta.importer?.settingsVersion);
  let legacy = {};
  const legacySettingsPath = path.join(ASSETS_ROOT, metaFilename(clean));
  if (existsSync(legacySettingsPath)) {
    legacy = JSON.parse(await readFile(legacySettingsPath, "utf8"));
  }
  const settings = normalizeStoredModelImportSettings(
    legacy.settings,
    meta.importer?.settings,
  );
  return {
    version: "braze/model-import-v3",
    sourceFilename: clean,
    settings,
    revision,
    updatedAt: existsSync(settingsPath) ? statSync(settingsPath).mtime.toISOString() : null,
    importVersion: versionFor(settingsPath, sourcePath),
  };
}

export async function writeModelImportDocument(filename, settings, expectedRevision) {
  const current = await readModelImportDocument(filename);
  const clean = cleanAssetFilename(filename);
  const sourcePath = safeAssetPath(path.join("3d-models", clean));
  const { meta: currentMeta } = await ensureAssetMeta(sourcePath);
  const nextSettings = mergePreservedModelImportSettings(currentMeta.importer?.settings, settings);
  const { meta, metaFilename: settingsPath, revision } = await updateAssetMeta(sourcePath, {
    importer: {
      id: "braze.model",
      settingsVersion: 3,
      settings: nextSettings,
    },
  }, {
    expectedRevision,
    backupDirectory: path.join(BACKUPS_ROOT, "asset-meta", ...clean.split("/")),
  });
  const next = {
    version: "braze/model-import-v3",
    sourceFilename: clean,
    settings: meta.importer.settings,
    revision,
    updatedAt: statSync(settingsPath).mtime.toISOString(),
  };
  return {
    ...next,
    importVersion: versionFor(settingsPath, safeAssetPath(path.join("3d-models", current.sourceFilename))),
  };
}
