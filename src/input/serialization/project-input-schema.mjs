import { decodeInputActionMapAsset } from "./input-action-map-asset-schema.mjs";

export const EMPTY_PROJECT_INPUT = Object.freeze({ version: 1 });

function assetReference(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.guid !== "string" || !/^[a-f0-9]{32}$/i.test(value.guid)
    || (value.localId !== undefined && value.localId !== "main")) throw new Error("Project Input requires an Input Action Map AssetRef with a GUID and optional localId 'main'.");
  return Object.freeze({ guid: value.guid.toLowerCase(), localId: "main" });
}

export function decodeProjectInput(value) {
  if (value === undefined) return EMPTY_PROJECT_INPUT;
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) throw new Error("Project Input requires a version-1 settings object.");
  return value.actionMap === undefined ? EMPTY_PROJECT_INPUT : Object.freeze({ version: 1, actionMap: assetReference(value.actionMap) });
}

export function encodeProjectInput(value) { return decodeProjectInput(value); }

/** Undefined is the only fallback signal; malformed selected snapshots fail. */
export function decodeCapturedProjectInput(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.revision !== "string" || !/^[a-f0-9]{64}$/i.test(value.revision)) throw new Error("Captured Project Input requires an asset document and SHA-256 revision.");
  return Object.freeze({ asset: assetReference(value.asset), revision: value.revision.toLowerCase(), document: decodeInputActionMapAsset(value.document) });
}
