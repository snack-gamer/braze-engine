import type { LibraryAsset } from "../../lib/asset-api";
import type { InputActionMap } from "../domain/action-map";
import { INPUT_ACTION_MAP_ASSET_VERSION, type InputActionMapAsset } from "../domain/input-action-map-asset";
import { decodeInputActionMapAsset } from "../serialization/input-action-map-asset-codec";

export type InputActionMapAssetDocument = Readonly<{ asset: LibraryAsset; document: InputActionMapAsset; revision: string }>;

export class InputAssetSaveConflictError extends Error {
  constructor(readonly actualRevision: string | null) {
    super("This Input Action Map changed on disk. Your edits are still unsaved; reload or revert before saving again.");
    this.name = "InputAssetSaveConflictError";
  }
}

async function request(url: string, options: RequestInit): Promise<InputActionMapAssetDocument> {
  const response = await fetch(url, options);
  const data = await response.json() as { status?: string; message?: string; asset?: LibraryAsset; document?: unknown; revision?: unknown; actualRevision?: unknown };
  if (response.status === 409) throw new InputAssetSaveConflictError(typeof data.actualRevision === "string" ? data.actualRevision : null);
  if (!response.ok || data.status !== "ok") throw new Error(data.message || "Input Action Map request failed.");
  if (!data.asset || data.asset.kind !== "inputActionMap" || typeof data.asset.guid !== "string" || !/^[a-f0-9]{32}$/i.test(data.asset.guid)
    || typeof data.revision !== "string" || !/^[a-f0-9]{64}$/i.test(data.revision)) throw new Error("Input Action Map response has invalid asset identity or revision.");
  return { asset: data.asset, document: decodeInputActionMapAsset(data.document), revision: data.revision };
}

export async function fetchInputActionMapAsset(asset: LibraryAsset, signal?: AbortSignal): Promise<InputActionMapAssetDocument> {
  const result = await request(`/api/assets/input-action-map?${new URLSearchParams({ filename: asset.filename })}`, { signal, cache: "no-store" });
  if (asset.guid && result.asset.guid?.toLowerCase() !== asset.guid.toLowerCase()) throw new Error("The selected Input Action Map asset identity changed. Refresh the Project window.");
  return result;
}

export function createInputActionMapAsset(name: string, map: InputActionMap, folder = ""): Promise<InputActionMapAssetDocument> {
  const document = decodeInputActionMapAsset({ version: INPUT_ACTION_MAP_ASSET_VERSION, name, map });
  return request("/api/assets/input-action-map", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document, folder }) });
}

export async function saveInputActionMapAsset(asset: LibraryAsset, document: InputActionMapAsset, baseRevision: string, signal?: AbortSignal): Promise<InputActionMapAssetDocument> {
  const result = await request(`/api/assets/input-action-map?${new URLSearchParams({ filename: asset.filename })}`, {
    method: "PUT", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: decodeInputActionMapAsset(document), baseRevision, assetGuid: asset.guid }),
  });
  if (asset.guid && result.asset.guid?.toLowerCase() !== asset.guid.toLowerCase()) throw new Error("The saved Input Action Map asset identity changed. Refresh the Project window.");
  return result;
}
