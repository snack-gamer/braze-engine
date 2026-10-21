import { decodeInputActionMapAsset } from "../../../src/input/serialization/input-action-map-asset-schema.mjs";
import { INPUT_ACTION_MAP_ASSET_MAX_BYTES } from "../../../src/input/domain/input-action-map-asset-identity.mjs";
import { readFile, stat } from "node:fs/promises";

export async function inputActionMapArtifacts(filename) {
  if ((await stat(filename)).size > INPUT_ACTION_MAP_ASSET_MAX_BYTES) throw new Error("Input Action Map asset exceeds 256 KiB.");
  const bytes = await readFile(filename);
  if (bytes.length > INPUT_ACTION_MAP_ASSET_MAX_BYTES) throw new Error("Input Action Map asset exceeds 256 KiB.");
  const document = decodeInputActionMapAsset(JSON.parse(bytes.toString("utf8")));
  return { dependencies: [], subAssets: [{ localId: "main", kind: "inputActionMap", name: document.name, sourceIndex: 0,
    inspectorValues: { Actions: document.map.actions.length, Bindings: document.map.actions.reduce((total, action) => total + action.bindings.length, 0) } }], diagnostics: [] };
}
