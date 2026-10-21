import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ASSETS_ROOT } from "../paths.mjs";
import { refreshAssetDatabase } from "./asset-database-store.mjs";
import { sourceByteCounter, writeImportedSource } from "./source-import-writer.mjs";
import { sourceDestination, sourceImportLocation } from "./source-import-paths.mjs";
import { SOURCE_IMPORT_EXTENSIONS, SOURCE_IMPORT_MAX_BYTES } from "../../../src/assets/domain/source-import-contract.mjs";

async function localSource(sourcePath) {
  // A pipe/device with a media extension must not block waiting for a producer.
  const handle = await open(sourcePath, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("sourcePath must identify one regular local file, not a directory or device.");
    if (stat.size > SOURCE_IMPORT_MAX_BYTES) throw new Error(`Source exceeds the ${SOURCE_IMPORT_MAX_BYTES}-byte agent import limit.`);
    return handle.createReadStream();
  } catch (error) { await handle.close(); throw error; }
}

/** Local source paths are read on the engine host; source bytes never enter the MCP context. */
export function createSourceImportCommand(overrides = {}) {
  const services = { root: ASSETS_ROOT, refreshAssetDatabase, writeImportedSource, ...overrides };
  return async (request) => {
    if (request.operation !== "assets.import") throw new Error("Expected assets.import.");
    const { sourcePath, destination } = request;
    if (typeof sourcePath !== "string" || sourcePath.length > 4096 || sourcePath.includes("\0") || !path.isAbsolute(sourcePath)) throw new Error("sourcePath must be an absolute file path on the local engine host, not a URL.");
    sourceDestination(destination);
    const extension = path.extname(sourcePath).toLowerCase();
    if (!SOURCE_IMPORT_EXTENSIONS.includes(extension) || path.extname(destination).toLowerCase() !== extension) throw new Error(`Import requires a supported source extension and matching destination extension: ${SOURCE_IMPORT_EXTENSIONS.join(", ")}. Scripts and metadata are not imported by this tool.`);
    if (request.apply !== undefined && typeof request.apply !== "boolean") throw new Error("apply must be boolean; omitted means preview.");
    if (request.apply && (typeof request.sourceRevision !== "string" || !/^[a-f0-9]{64}$/.test(request.sourceRevision))) throw new Error("Apply requires sourceRevision from a successful assets.import preview.");
    await sourceImportLocation(services.root, destination);
    if (!request.apply) {
      const counter = sourceByteCounter(SOURCE_IMPORT_MAX_BYTES);
      await pipeline(await localSource(sourcePath), counter.stream, new Writable({ write(_chunk, _encoding, done) { done(); } }));
      return { applied: false, destination, ...counter.result() };
    }
    const imported = await services.writeImportedSource({ root: services.root, destination,
      openSource: () => localSource(sourcePath), expectedSourceRevision: request.sourceRevision, maxBytes: SOURCE_IMPORT_MAX_BYTES });
    // An indexed source is not proof that a browser can render/decode it. Keep diagnostics visible.
    let asset = null, indexingError = null;
    try {
      const database = await services.refreshAssetDatabase();
      asset = database.records.find((record) => record.guid === imported.guid && record.sourcePath === imported.filename) ?? null;
      if (!asset) indexingError = "Imported source is not yet in the Asset Database. Inspect assets.list before use.";
    } catch (error) { indexingError = `Source was imported; index refresh failed: ${error instanceof Error ? error.message : String(error)}. Inspect assets.list; do not replay the import.`; }
    return { applied: true, ...imported, asset, indexingError };
  };
}
