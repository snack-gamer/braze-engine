import { createInputMapAuthoring } from "./input-map-authoring.mjs";
import { refreshAssetDatabase } from "./assets/asset-database-store.mjs";
import { decodeProjectInput } from "../../src/input/serialization/project-input-schema.mjs";
import { readProjectDocument, updateProjectDocument, projectBackupDirectory, ProjectSectionConflictError } from "./project-document-store.mjs";
import { BACKUPS_ROOT, LEGACY_PROJECT_FILE, PROJECT_FILE } from "./paths.mjs";

/** Saved input authoring never mutates a tab's unsaved asset draft or a running input snapshot. */
export function createInputAuthoringCommands(overrides = {}) {
  const services = { maps: createInputMapAuthoring(), refreshAssetDatabase, readProjectDocument, updateProjectDocument,
    filePath: PROJECT_FILE, legacyFilePath: LEGACY_PROJECT_FILE, backupDirectory: projectBackupDirectory(BACKUPS_ROOT), ...overrides };
  const resolve = async (assetGuid) => {
    if (typeof assetGuid !== "string" || !/^[a-f0-9]{32}$/i.test(assetGuid)) throw new Error("assetGuid must be a 32-character hexadecimal GUID from assets.list or input.map.create.");
    const database = await services.refreshAssetDatabase();
    const matches = database.records.filter((asset) => asset.guid?.toLowerCase() === assetGuid.toLowerCase());
    if (matches.length !== 1) throw new Error(`Input Action Map ${assetGuid} is missing or ambiguous. Inspect assets.list.`);
    const asset = matches[0];
    if (asset.kind !== "inputActionMap" || asset.importerId !== "braze.input-action-map" || asset.status !== "ready") throw new Error(`Asset ${assetGuid} is not a ready Input Action Map.`);
    return asset;
  };
  const projectReceipt = (current) => ({ settings: decodeProjectInput(current.value.input), revision: current.sectionRevisions.input ?? null });
  return async (request) => {
    const { operation } = request;
    if (!["input.map.create", "input.map.inspect", "input.map.save", "input.project.inspect", "input.project.select"].includes(operation)) throw new Error(`Unknown input operation: ${String(operation)}`);
    if (request.apply !== undefined && typeof request.apply !== "boolean") throw new Error("apply must be boolean; omitted means preview.");
    const apply = request.apply === true;
    if (operation === "input.map.create") return { ...await services.maps.create(request, apply), applied: apply };
    if (operation === "input.map.inspect" || operation === "input.map.save") {
      const asset = await resolve(request.assetGuid);
      return operation === "input.map.inspect" ? services.maps.inspect(asset.sourcePath, request.assetGuid)
        : { ...await services.maps.save(asset.sourcePath, request, apply), applied: apply };
    }
    const current = await services.readProjectDocument(services);
    if (operation === "input.project.inspect") {
      const receipt = projectReceipt(current);
      if (!receipt.settings.actionMap) return { ...receipt, asset: null, problem: null };
      try {
        const asset = await resolve(receipt.settings.actionMap.guid);
        const loaded = await services.maps.inspect(asset.sourcePath, receipt.settings.actionMap.guid);
        return { ...receipt, asset: loaded.asset, mapRevision: loaded.revision, problem: null };
      } catch (error) { return { ...receipt, asset: null, problem: error instanceof Error ? error.message : String(error) }; }
    }
    if (!Object.hasOwn(request, "baseRevision") || request.baseRevision !== null && typeof request.baseRevision !== "string") throw new Error("input.project.select requires the input section baseRevision from input.project.inspect (string or null).");
    if (!Object.hasOwn(request, "assetGuid") || request.assetGuid !== null && typeof request.assetGuid !== "string") throw new Error("assetGuid is required; null explicitly clears the project selection.");
    const revision = current.sectionRevisions.input ?? null;
    if (request.baseRevision !== revision) throw new ProjectSectionConflictError("input", request.baseRevision, revision);
    if (request.assetGuid !== null) {
      const asset = await resolve(request.assetGuid);
      await services.maps.inspect(asset.sourcePath, request.assetGuid);
    }
    const settings = decodeProjectInput({ version: 1, ...(request.assetGuid === null ? {} : { actionMap: { guid: request.assetGuid } }) });
    if (!apply) return { settings, revision, applied: false };
    const saved = await services.updateProjectDocument({ ...services, patch: { input: settings }, expectedSectionRevisions: { input: request.baseRevision } });
    return { ...projectReceipt(saved), applied: true };
  };
}
