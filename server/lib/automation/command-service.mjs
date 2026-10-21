import { DocumentConflictError } from "../json-document-store.mjs";
import { normalizeSceneId, SCENE_DOCUMENT_VERSION } from "../scene-document-store.mjs";
import { animatorCommandOptions } from "./animator-command-options.mjs";

function page(items, offset = 0, limit = 100) {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("offset must be nonnegative; limit must be 1–200.");
  return { items: items.slice(offset, offset + limit), total: items.length, nextOffset: offset + limit < items.length ? offset + limit : null };
}

/** All transports call this service; only the injected scene store can persist changes. */
export function createAutomationService(dependencies) {
  const { root, legacyRoot, backupsRoot, readSceneDocument, writeSceneDocument, listSceneDocuments, refreshAssetDatabase, loadAuthoring, executeInputCommand, executeSourceImport, executePrefabCommand } = dependencies;
  return async (request) => {
    if (!request || request.version !== 1 || typeof request.requestId !== "string" || !request.requestId || request.requestId.length > 256) throw new Error("Expected version: 1 and a nonempty requestId of at most 256 characters.");
    const { operation, sceneId = "current" } = request;
    if (typeof operation === "string" && operation.startsWith("prefab.")) return executePrefabCommand(request);
    if (operation === "assets.import") return executeSourceImport(request);
    if (typeof operation === "string" && operation.startsWith("input.")) return executeInputCommand(request);
    if (operation === "scene.list") return page(await listSceneDocuments(root, legacyRoot), request.offset, request.limit);
    if (operation === "assets.list") {
      const database = await refreshAssetDatabase();
      const query = typeof request.query === "string" ? request.query.toLowerCase() : "";
      return page(database.records.filter((asset) => asset.sourcePath.toLowerCase().includes(query)), request.offset, request.limit);
    }
    if (!["scene.inspect", "scene.validate", "scene.edit"].includes(operation)) throw new Error(`Unknown operation: ${String(operation)}`);
    const id = normalizeSceneId(sceneId);
    const current = await readSceneDocument({ root, legacyRoot, id });
    if (operation === "scene.inspect") {
      if (!current) return { sceneId: id, revision: null, exists: false, items: [], total: 0, nextOffset: null };
      const { objects, ...metadata } = current.value;
      return { sceneId: id, revision: current.revision, exists: true, metadata, ...page(objects, request.offset, request.limit) };
    }
    const authoring = await loadAuthoring();
    if (operation === "scene.validate") {
      if (!current) throw new Error(`Scene ${id} does not exist.`);
      return { sceneId: id, revision: current.revision, ...authoring.validateAutomationScene(current.value) };
    }
    if (!Object.hasOwn(request, "baseRevision") || (request.baseRevision !== null && typeof request.baseRevision !== "string")) throw new Error("scene.edit requires baseRevision (null only for a new scene).");
    if (request.apply !== undefined && typeof request.apply !== "boolean") throw new Error("apply must be boolean; omitted means preview.");
    if (request.baseRevision !== (current?.revision ?? null)) throw new DocumentConflictError(request.baseRevision, current?.revision ?? null);
    const referencedAssets = Array.isArray(request.commands) ? request.commands.filter((command) => command?.op === "object.create" && command.assetRef).map((command) => command.assetRef) : [];
    if (referencedAssets.length) {
      const database = await refreshAssetDatabase();
      for (const reference of referencedAssets) {
        const asset = database.records.find((entry) => entry.guid === reference.guid);
        if (!asset || (reference.localId !== "main" && !asset.subAssets?.some((entry) => entry.localId === reference.localId))) {
          throw new Error(`Unknown asset reference ${String(reference.guid)}:${String(reference.localId)}. Inspect assets.list first.`);
        }
      }
    }
    const initial = current?.value ?? { version: SCENE_DOCUMENT_VERSION, objects: [] };
    const result = authoring.executeSceneCommands(initial, request.commands, await animatorCommandOptions(request.commands, refreshAssetDatabase));
    const response = { sceneId: id, baseRevision: current?.revision ?? null, revision: current?.revision ?? null,
      applied: false, changedIds: result.changedIds, valid: result.valid, diagnostics: result.diagnostics, objectCount: result.objectCount };
    if (!request.apply) return response;
    if (!result.valid) throw new Error(`Scene validation failed: ${result.diagnostics.join("\n")}`);
    const written = await writeSceneDocument({ root, legacyRoot, backupsRoot, id, scene: result.scene, expectedRevision: request.baseRevision });
    return { ...response, revision: written.revision, applied: true };
  };
}
