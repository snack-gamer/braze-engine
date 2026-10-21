import type { LibraryAsset } from "../../lib/asset-api";
import type { RuntimeModelImportDocument } from "../application/model-import-document-provider";
import { normalizeModelImportFilename } from "../domain/model-import-filename";

const MODEL_IMPORT_DOCUMENT_VERSION = "braze/model-import-v3";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const own = Object.create(null) as Record<string, unknown>;
  for (const [key, item] of Object.entries(value)) own[key] = item;
  return own;
}

function requiredString(input: Record<string, unknown>, key: string, label: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}.${key} must be a string.`);
  return value;
}

export function decodeImportedAssets(value: unknown): LibraryAsset[] {
  if (!Array.isArray(value)) throw new Error("player importedAssets must be an array.");
  const sourceIndexByFilename = new Map<string, number>();
  return value.map((item, index) => {
    const input = record(item, `player importedAssets[${index}]`);
    const sourceFilename = requiredString(input, "filename", `player importedAssets[${index}]`);
    const filename = normalizeModelImportFilename(sourceFilename);
    if (!filename) {
      throw new Error(`player importedAssets[${index}].filename is invalid.`);
    }
    const previousIndex = sourceIndexByFilename.get(filename);
    if (previousIndex !== undefined) {
      throw new Error(
        `player importedAssets[${previousIndex}] and player importedAssets[${index}] normalize to the same filename ${JSON.stringify(filename)}.`,
      );
    }
    sourceIndexByFilename.set(filename, index);
    const asset = {
      ...input,
      name: requiredString(input, "name", `player importedAssets[${index}]`),
      filename,
      path: requiredString(input, "path", `player importedAssets[${index}]`),
      url: requiredString(input, "url", `player importedAssets[${index}]`),
      sizeBytes: input.sizeBytes,
    };
    if (typeof asset.sizeBytes !== "number" || !Number.isFinite(asset.sizeBytes)) {
      throw new Error(`player importedAssets[${index}].sizeBytes must be finite.`);
    }
    return asset as LibraryAsset;
  });
}


export function decodeModelImportDocuments(value: unknown): Record<string, RuntimeModelImportDocument> {
  const input = record(value, "player modelImportDocuments");
  const prepared: Array<readonly [string, string, unknown]> = [];
  const sourceKeyByFilename = new Map<string, string>();
  for (const [sourceKey, raw] of Object.entries(input)) {
    const filename = normalizeModelImportFilename(sourceKey);
    if (!filename) {
      throw new Error(`player modelImportDocuments contains invalid filename ${JSON.stringify(sourceKey)}.`);
    }
    const previousSource = sourceKeyByFilename.get(filename);
    if (previousSource !== undefined) {
      throw new Error(
        `player modelImportDocuments keys ${JSON.stringify(previousSource)} and ${JSON.stringify(sourceKey)} normalize to the same filename ${JSON.stringify(filename)}.`,
      );
    }
    sourceKeyByFilename.set(filename, sourceKey);
    prepared.push([sourceKey, filename, raw]);
  }

  const decoded: Array<[string, RuntimeModelImportDocument]> = [];
  for (const [sourceKey, filename, raw] of prepared) {
    const document = record(raw, `player modelImportDocuments.${sourceKey}`);
    if (document.version !== MODEL_IMPORT_DOCUMENT_VERSION) {
      throw new Error(
        `Unsupported player model import document version ${String(document.version)} for ${JSON.stringify(sourceKey)}.`,
      );
    }
    const sourceFilename = normalizeModelImportFilename(
      requiredString(document, "sourceFilename", `player modelImportDocuments.${sourceKey}`),
    );
    if (sourceFilename !== filename) {
      throw new Error(
        `player modelImportDocuments.${sourceKey}.sourceFilename must identify ${JSON.stringify(filename)}.`,
      );
    }
    const updatedAt = document.updatedAt;
    if (updatedAt !== null && typeof updatedAt !== "string") {
      throw new Error(`player modelImportDocuments.${sourceKey}.updatedAt must be a string or null.`);
    }
    decoded.push([filename, {
      version: MODEL_IMPORT_DOCUMENT_VERSION,
      sourceFilename: filename,
      settings: record(document.settings, `player modelImportDocuments.${sourceKey}.settings`) as never,
      revision: requiredString(document, "revision", `player modelImportDocuments.${sourceKey}`),
      updatedAt,
      importVersion: requiredString(document, "importVersion", `player modelImportDocuments.${sourceKey}`),
    }]);
  }
  return Object.fromEntries(decoded);
}

export function validateModelImportManifest(
  importedAssets: readonly LibraryAsset[],
  modelImportDocuments: Readonly<Record<string, RuntimeModelImportDocument>>,
): void {
  const assetFilenames = new Set(importedAssets.map((asset) => asset.filename));
  for (const filename of assetFilenames) {
    if (!Object.prototype.hasOwnProperty.call(modelImportDocuments, filename)) {
      throw new Error(`player modelImportDocuments is missing imported asset ${JSON.stringify(filename)}.`);
    }
  }
  for (const filename of Object.keys(modelImportDocuments)) {
    if (!assetFilenames.has(filename)) {
      throw new Error(`player modelImportDocuments contains unknown imported asset ${JSON.stringify(filename)}.`);
    }
  }
}
