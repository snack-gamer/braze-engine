import path from "node:path";
import { createInputActionMapDocument, readInputActionMapDocument, writeInputActionMapDocument, InputActionMapNotFoundError, validateInputActionMapFilename } from "./input-action-map-document-store.mjs";
import { INPUT_ACTION_MAP_ASSET_SUFFIX } from "../../src/input/domain/input-action-map-asset-identity.mjs";
import { decodeInputActionMapAsset } from "../../src/input/serialization/input-action-map-asset-schema.mjs";
import { availableFilename, describeIndexedAsset } from "./assets/library-asset-records.mjs";
import { safeName } from "./encoding.mjs";
import { DocumentConflictError } from "./json-document-store.mjs";
import { ASSETS_ROOT, BACKUPS_ROOT } from "./paths.mjs";

function folderPath(value) {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || value.length > 1024 || value.includes("\\") || /[\u0000-\u001f?#]/.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)
    || value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Input Action Map folder must be project-relative.");
  return value;
}

/** Manual HTTP and agent commands share document validation and the revision-checked store. */
export function createInputMapAuthoring(overrides = {}) {
  const services = { root: ASSETS_ROOT, backupsRoot: path.join(BACKUPS_ROOT, "input-action-maps"),
    availableFilename, describeIndexedAsset, createInputActionMapDocument, readInputActionMapDocument, writeInputActionMapDocument, ...overrides };
  const receipt = async (loaded, assetGuid) => {
    const asset = await services.describeIndexedAsset(loaded.filename, loaded.revision);
    if (assetGuid !== undefined && asset?.guid?.toLowerCase() !== assetGuid.toLowerCase()) throw new Error("Input Action Map asset identity changed. Inspect again before editing.");
    return { asset, document: loaded.value, revision: loaded.revision };
  };
  const inspect = async (filename, assetGuid) => {
    validateInputActionMapFilename(filename);
    const loaded = await services.readInputActionMapDocument({ root: services.root, filename });
    if (!loaded) throw new InputActionMapNotFoundError(filename);
    return receipt({ ...loaded, filename }, assetGuid);
  };
  return {
    inspect,
    async create(body, apply = true) {
      const document = decodeInputActionMapAsset(body.document), folder = folderPath(body.folder);
      const filename = services.availableFilename(`${folder ? `${folder}/` : ""}${safeName(document.name)}${INPUT_ACTION_MAP_ASSET_SUFFIX}`);
      if (!apply) return { asset: null, document, revision: null, filename };
      const written = await services.createInputActionMapDocument({ root: services.root, backupsRoot: services.backupsRoot, filename, document });
      return receipt(written);
    },
    async save(filename, body, apply = true) {
      validateInputActionMapFilename(filename);
      const document = decodeInputActionMapAsset(body.document);
      if (typeof body.baseRevision !== "string") throw new Error("Input Action Map saves require baseRevision from the loaded document.");
      if (body.assetGuid !== undefined && (typeof body.assetGuid !== "string" || !/^[a-f0-9]{32}$/i.test(body.assetGuid))) throw new Error("Input Action Map assetGuid must be a valid GUID.");
      if (!apply) {
        const current = await inspect(filename, body.assetGuid);
        if (current.revision !== body.baseRevision) throw new DocumentConflictError(body.baseRevision, current.revision);
        return { ...current, document };
      }
      const written = await services.writeInputActionMapDocument({ root: services.root, backupsRoot: services.backupsRoot, filename,
        document, expectedRevision: body.baseRevision, expectedGuid: body.assetGuid });
      return receipt(written, body.assetGuid);
    },
  };
}
