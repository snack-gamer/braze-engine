import { decodeInputActionMap } from "./action-map-schema.mjs";
import { INPUT_ACTION_MAP_ASSET_VERSION, INPUT_ACTION_MAP_ASSET_MAX_BYTES } from "../domain/input-action-map-asset-identity.mjs";

/** Same authored document gate in the editor, server and static build. */
export function decodeInputActionMapAsset(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Input Action Map asset must be an object.");
  if (value.version !== INPUT_ACTION_MAP_ASSET_VERSION) throw new Error(`Unsupported Input Action Map asset version ${String(value.version)}.`);
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 128 || /[\u0000-\u001f]/.test(value.name)) throw new Error("Input Action Map asset requires a name of 1–128 printable characters.");
  const document = Object.freeze({ version: INPUT_ACTION_MAP_ASSET_VERSION, name: value.name.trim(), map: decodeInputActionMap(value.map) });
  if (new TextEncoder().encode(JSON.stringify(document)).length > INPUT_ACTION_MAP_ASSET_MAX_BYTES) throw new Error("Input Action Map asset exceeds 256 KiB.");
  return document;
}

export function encodeInputActionMapAsset(value) {
  return decodeInputActionMapAsset(value);
}
