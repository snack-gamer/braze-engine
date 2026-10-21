import { randomBytes } from "node:crypto";

const ASSET_GUID_PATTERN = /^[a-f0-9]{32}$/;

export function isAssetGuid(value) {
  return ASSET_GUID_PATTERN.test(value);
}

export function newAssetGuid() {
  return randomBytes(16).toString("hex");
}

export function assetReference(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const guid = typeof value.guid === "string" ? value.guid.trim().toLowerCase() : "";
  if (!isAssetGuid(guid)) return null;
  const localIdValue = value.localId ?? value.local_id;
  return {
    guid,
    localId: typeof localIdValue === "string" && localIdValue.trim()
      ? localIdValue.trim()
      : "main",
  };
}
