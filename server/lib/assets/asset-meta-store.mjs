import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  DocumentConflictError,
  documentRevision,
  writeJsonDocument,
} from "../json-document-store.mjs";
import { classifyAssetSource } from "./asset-classification.mjs";
import { assetDiagnostic } from "./asset-diagnostics.mjs";
import { isAssetGuid, newAssetGuid } from "./asset-identity.mjs";

export const ASSET_META_SUFFIX = ".braze.meta";
export const ASSET_META_SCHEMA_VERSION = 1;

const writeQueues = new Map();

function cleanLabels(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function cleanForeignIds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [key, id] of Object.entries(value)) {
    const cleanKey = String(key).trim();
    if (!cleanKey || (typeof id !== "string" && typeof id !== "number")) continue;
    const cleanId = String(id).trim();
    if (cleanId) output[cleanKey] = cleanId;
  }
  return output;
}

function cleanSettings(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanSettingsVersion(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function assetMetaDocument(raw, classification, guid) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const sourceImporter =
    source.importer && typeof source.importer === "object" && !Array.isArray(source.importer)
      ? source.importer
      : {};
  const importerId =
    typeof sourceImporter.id === "string" && sourceImporter.id.trim()
      ? sourceImporter.id.trim()
      : classification.importerId;
  const {
    version: legacySettingsVersion,
    settingsVersion: authoredSettingsVersion,
    id: _authoredImporterId,
    settings: _authoredImporterSettings,
    ...authoredImporter
  } = sourceImporter;
  const importer = {
    ...authoredImporter,
    id: importerId,
    settingsVersion: cleanSettingsVersion(authoredSettingsVersion ?? legacySettingsVersion),
    settings: cleanSettings(sourceImporter.settings),
  };

  const {
    sourceHash: _sourceHash,
    status: _status,
    dependencies: _dependencies,
    subAssets: _subAssets,
    diagnostics: _diagnostics,
    version: _legacyFileFormatVersion,
    fileFormatVersion: _fileFormatVersion,
    guid: _guid,
    importer: _importer,
    labels: _labels,
    foreignIds: _foreignIds,
    ...authored
  } = source;

  return {
    ...authored,
    fileFormatVersion: ASSET_META_SCHEMA_VERSION,
    guid,
    importer,
    labels: cleanLabels(source.labels),
    foreignIds: cleanForeignIds(source.foreignIds),
  };
}

function sameJson(left, right) {
  return isDeepStrictEqual(left, right);
}

function enqueueMetaWrite(metaFilename, operation) {
  const previous = writeQueues.get(metaFilename) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  const settled = next.then(() => undefined, () => undefined);
  writeQueues.set(metaFilename, settled);
  void settled.finally(() => {
    if (writeQueues.get(metaFilename) === settled) writeQueues.delete(metaFilename);
  });
  return next;
}

async function unityGuidForSource(sourceFilename) {
  try {
    const raw = await readFile(`${sourceFilename}.meta`, "utf8");
    const match = raw.match(/^guid:\s*([a-fA-F0-9]{32})\s*$/m);
    return match ? match[1].toLowerCase() : null;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function loadOrCreateAssetMeta(sourceFilename, classification) {
  const metaFilename = metaPathForSource(sourceFilename);
  const diagnostics = [];
  let raw = null;
  let revision = null;
  let missing = false;
  let invalid = false;
  let enriched = false;

  try {
    const text = await readFile(metaFilename, "utf8");
    revision = documentRevision(text);
    raw = JSON.parse(text);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      missing = true;
    } else {
      invalid = true;
      diagnostics.push(assetDiagnostic(
        "invalid-meta",
        "error",
        `Could not read asset metadata: ${error instanceof Error ? error.message : String(error)}`,
      ));
    }
  }

  let unityGuid = null;
  try {
    unityGuid = await unityGuidForSource(sourceFilename);
  } catch (error) {
    diagnostics.push(assetDiagnostic(
      "unity-meta-read-failed",
      "error",
      `Could not read Unity metadata bridge: ${error instanceof Error ? error.message : String(error)}`,
    ));
  }
  if (unityGuid) {
    const currentForeignIds = cleanForeignIds(raw?.foreignIds);
    if (!currentForeignIds.unityGuid) {
      raw = { ...(raw ?? {}), foreignIds: { ...currentForeignIds, unityGuid } };
      enriched = true;
    }
  }

  const existingGuid = raw && typeof raw.guid === "string" ? raw.guid.toLowerCase() : "";
  const guid = isAssetGuid(existingGuid) ? existingGuid : newAssetGuid();
  if (!missing && raw && !isAssetGuid(existingGuid)) {
    diagnostics.push(assetDiagnostic(
      "invalid-guid",
      "warning",
      "Asset metadata had no valid GUID; a replacement was generated.",
    ));
  }
  const meta = assetMetaDocument(raw, classification, guid);

  if (!invalid && (missing || enriched || !sameJson(raw, meta))) {
    try {
      const written = await writeJsonDocument({
        filePath: metaFilename,
        value: meta,
        expectedRevision: missing ? null : revision,
      });
      revision = written.revision;
      if (missing) {
        diagnostics.push(assetDiagnostic(
          "meta-created",
          "info",
          "Asset metadata sidecar was created.",
        ));
      }
    } catch (error) {
      diagnostics.push(assetDiagnostic(
        "meta-write-failed",
        "error",
        `Could not write asset metadata: ${error instanceof Error ? error.message : String(error)}`,
      ));
    }
  }

  return { meta, metaFilename, diagnostics, revision };
}

export async function ensureAssetMeta(sourceFilename) {
  const absolute = path.resolve(sourceFilename);
  return loadOrCreateAssetMeta(absolute, classifyAssetSource(absolute));
}

export async function updateAssetMeta(sourceFilename, authoredPatch, options = {}) {
  const absolute = path.resolve(sourceFilename);
  const classification = classifyAssetSource(absolute);
  const metaFilename = metaPathForSource(absolute);
  return enqueueMetaWrite(metaFilename, async () => {
    const current = await loadOrCreateAssetMeta(absolute, classification);
    if (current.diagnostics.some((diagnostic) => diagnostic.code === "invalid-meta")) {
      throw new Error(`Cannot update invalid asset metadata '${current.metaFilename}'`);
    }
    if (
      Object.hasOwn(options, "expectedRevision")
      && options.expectedRevision !== current.revision
    ) {
      throw new DocumentConflictError(options.expectedRevision, current.revision);
    }
    const patch = authoredPatch && typeof authoredPatch === "object" && !Array.isArray(authoredPatch)
      ? authoredPatch
      : {};
    const next = assetMetaDocument(
      { ...current.meta, ...patch },
      classification,
      current.meta.guid,
    );
    const written = await writeJsonDocument({
      filePath: current.metaFilename,
      value: next,
      expectedRevision: current.revision,
      backupDirectory: options.backupDirectory,
      backupLimit: options.backupLimit,
    });
    return {
      ...current,
      meta: next,
      revision: written.revision,
      changed: written.changed,
    };
  });
}

export function isAssetMetaPath(filename) {
  return String(filename).toLowerCase().endsWith(ASSET_META_SUFFIX);
}

export function metaPathForSource(sourceFilename) {
  return `${sourceFilename}${ASSET_META_SUFFIX}`;
}
