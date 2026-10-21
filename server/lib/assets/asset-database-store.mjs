import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  readJsonDocument,
  writeTextAtomic,
} from "../json-document-store.mjs";
import { ASSETS_ROOT, LIBRARY_ROOT } from "../paths.mjs";
import { scanAssetIndex } from "./asset-index-scan.mjs";

export const ASSET_INDEX_FILE = path.join(LIBRARY_ROOT, "asset-index.json");

const refreshQueues = new Map();

function foldersForRecords(records) {
  const folders = new Set();
  for (const record of records) {
    const parts = record.sourcePath.split("/").slice(0, -1);
    for (let index = 1; index <= parts.length; index += 1) {
      folders.add(parts.slice(0, index).join("/"));
    }
  }
  return [...folders].sort((left, right) => left.localeCompare(right));
}

async function previousRecords(indexFile) {
  try {
    const document = await readJsonDocument(indexFile);
    return Array.isArray(document?.value?.records) ? document.value.records : [];
  } catch {
    // The index is a generated cache. A malformed copy is rebuilt from sources
    // and their authored sidecars rather than becoming an editor load blocker.
    return [];
  }
}

function enqueueRefresh(indexFile, operation) {
  const previous = refreshQueues.get(indexFile) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  const settled = next.then(() => undefined, () => undefined);
  refreshQueues.set(indexFile, settled);
  void settled.finally(() => {
    if (refreshQueues.get(indexFile) === settled) refreshQueues.delete(indexFile);
  });
  return next;
}

/** Rebuilds the generated index while retaining enough history for safe rename reconciliation. */
export async function refreshAssetDatabase(options = {}) {
  const assetsRoot = path.resolve(options.assetsRoot ?? ASSETS_ROOT);
  const indexFile = path.resolve(options.indexFile ?? ASSET_INDEX_FILE);
  return enqueueRefresh(indexFile, async () => {
    await mkdir(assetsRoot, { recursive: true });
    const index = await scanAssetIndex(assetsRoot, {
      previousRecords: await previousRecords(indexFile),
    });
    const document = {
      version: 1,
      generatedAt: new Date().toISOString(),
      records: index.records,
      diagnostics: index.diagnostics,
    };
    await mkdir(path.dirname(indexFile), { recursive: true });
    await writeTextAtomic(indexFile, `${JSON.stringify(document, null, 2)}\n`);
    return {
      ...document,
      folders: foldersForRecords(document.records),
    };
  });
}
