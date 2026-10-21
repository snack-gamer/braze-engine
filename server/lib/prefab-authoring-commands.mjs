import path from "node:path";
import { realpath, stat } from "node:fs/promises";
import { createPrefabDocument, readPrefabDocument, writePrefabDocument, PREFAB_CANONICAL_EXT } from "./prefab-document-store.mjs";
import { describeIndexedAsset } from "./assets/library-asset-records.mjs";
import { refreshAssetDatabase } from "./assets/asset-database-store.mjs";
import { sourceDestination, sourceImportLocation, unusedSourceDestination } from "./assets/source-import-paths.mjs";
import { DocumentConflictError, serializeJsonDocument } from "./json-document-store.mjs";
import { safeName } from "./encoding.mjs";
import { ASSETS_ROOT, BACKUPS_ROOT } from "./paths.mjs";
import { animatorCommandOptions } from "./automation/animator-command-options.mjs";

const MAX_BYTES = 1024 * 1024;
function bounded(document) {
  if (Buffer.byteLength(serializeJsonDocument({ ...document, savedAt: new Date().toISOString() })) > MAX_BYTES) throw new Error("Agent prefab authoring supports sources up to 1 MiB.");
}
function page(items, offset = 0, limit = 100) {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("offset must be nonnegative; limit must be 1–200.");
  return { items: items.slice(offset, offset + limit), total: items.length, nextOffset: offset + limit < items.length ? offset + limit : null };
}

/** Saved commands and manual Prefab Mode use the same queued, revision-checked document store. */
export function createPrefabAuthoringCommands(overrides = {}) {
  const services = { root: ASSETS_ROOT, backupsRoot: path.join(BACKUPS_ROOT, "prefabs"), refreshAssetDatabase,
    describeIndexedAsset, createPrefabDocument, readPrefabDocument, writePrefabDocument, ...overrides };
  const resolve = async (guid) => {
    if (typeof guid !== "string" || !/^[a-f0-9]{32}$/i.test(guid)) throw new Error("assetGuid must be a 32-character hexadecimal GUID.");
    const database = await services.refreshAssetDatabase();
    const matches = database.records.filter((asset) => asset.guid?.toLowerCase() === guid.toLowerCase());
    if (matches.length !== 1 || matches[0].kind !== "prefab" || matches[0].importerId !== "braze.prefab") throw new Error("Prefab is missing, ambiguous or the wrong asset type. Inspect assets.list.");
    const asset = matches[0], root = await realpath(services.root), filename = await realpath(path.join(root, asset.sourcePath));
    const relative = path.relative(root, filename);
    if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error("Prefab source escapes Assets.");
    if ((await stat(filename)).size > MAX_BYTES) throw new Error("Agent prefab authoring supports sources up to 1 MiB.");
    const loaded = await services.readPrefabDocument({ root: services.root, filename: asset.sourcePath });
    if (!loaded) throw new Error("Prefab source disappeared. Inspect again.");
    bounded(loaded.value);
    const indexed = await services.describeIndexedAsset(asset.sourcePath, loaded.revision);
    if (indexed?.guid?.toLowerCase() !== guid.toLowerCase()) throw new Error("Prefab asset identity changed. Inspect again.");
    return { asset: indexed, ...loaded };
  };
  return async (request) => {
    if (!["prefab.create", "prefab.inspect", "prefab.edit"].includes(request.operation)) throw new Error(`Unknown prefab operation: ${String(request.operation)}`);
    if (request.apply !== undefined && typeof request.apply !== "boolean") throw new Error("apply must be boolean; omitted means preview.");
    const authoring = await services.loadAuthoring(), apply = request.apply === true;
    if (request.operation === "prefab.create") {
      const result = authoring.createPrefab(request.name, request.commands, await animatorCommandOptions(request.commands, services.refreshAssetDatabase));
      const folder = request.folder === undefined || request.folder === "" ? "" : sourceDestination(request.folder);
      const filename = await unusedSourceDestination(services.root, `${folder ? `${folder}/` : ""}${safeName(result.document.name)}${PREFAB_CANONICAL_EXT}`);
      await sourceImportLocation(services.root, filename);
      bounded(result.document);
      const { document, ...summary } = result;
      if (!apply) return { ...summary, filename, revision: null, asset: null, applied: false };
      if (!result.valid) throw new Error(`Prefab validation failed: ${result.diagnostics.join("; ")}`);
      const saved = await services.createPrefabDocument({ ...services, filename, prefab: document });
      return { ...summary, filename, revision: saved.revision, asset: await services.describeIndexedAsset(filename, saved.revision), applied: true };
    }
    const current = await resolve(request.assetGuid);
    if (request.operation === "prefab.inspect") {
      const { document, ...summary } = authoring.inspectPrefab(current.value), { objects, ...metadata } = document;
      return { ...summary, asset: current.asset, revision: current.revision, metadata, ...page(objects, request.offset, request.limit) };
    }
    if (typeof request.baseRevision !== "string") throw new Error("prefab.edit requires baseRevision from prefab.inspect.");
    if (request.baseRevision !== current.revision) throw new DocumentConflictError(request.baseRevision, current.revision);
    const { document, ...summary } = authoring.executePrefabCommands(current.value, request.commands, await animatorCommandOptions(request.commands, services.refreshAssetDatabase));
    bounded(document);
    const receipt = { ...summary, asset: current.asset, baseRevision: current.revision, revision: current.revision, applied: false };
    if (!apply) return receipt;
    if (!summary.valid) throw new Error(`Prefab validation failed: ${summary.diagnostics.join("; ")}`);
    const saved = await services.writePrefabDocument({ ...services, filename: current.filename, prefab: document,
      expectedRevision: request.baseRevision, expectedGuid: request.assetGuid });
    return { ...receipt, revision: saved.revision, asset: await services.describeIndexedAsset(current.filename, saved.revision), applied: true };
  };
}
