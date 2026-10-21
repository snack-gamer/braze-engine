import { createHash } from "node:crypto";

const MODEL_IMPORTER_ID = "braze.model";
const REVISION_CONTRACT = "braze/model-content-revision-v1";

function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalJsonValue(item)]),
  );
}

/**
 * Returns the revision of the bytes the runtime effectively imports.
 * Model output depends on both source bytes and importer configuration, so a
 * source-only hash is not a safe cache key after Apply & Reimport.
 */
export function effectiveAssetContentRevision(record) {
  if (typeof record?.sourceHash !== "string") return null;
  if (record.importerId !== MODEL_IMPORTER_ID) return record.sourceHash;

  const importerContract = JSON.stringify(canonicalJsonValue({
    id: record.importerId,
    settingsVersion: record.importerVersion,
    settings: record.importSettings ?? {},
  }));
  return createHash("sha256")
    .update(REVISION_CONTRACT)
    .update("\0")
    .update(record.sourceHash)
    .update("\0")
    .update(importerContract)
    .digest("hex");
}
