import { useCallback, useEffect, useRef, useState } from "react";
import type { useAssetFolders } from "../../hooks/useAssetFolders";
import type { AssetBrowserProps, Editing, ItemKey } from "./types";
import type { AssetCatalogEntry } from "./asset-catalog";

type AuthoringInput = Pick<AssetBrowserProps, "createMaterial" | "characterAssets" | "updateMaterial"
  | "duplicateMaterial" | "onPrefabDisplayNameChange" | "refreshAssets"> & {
  folders: ReturnType<typeof useAssetFolders>;
  path: string;
  focusOne: (key: ItemKey) => void;
  finishEditing: (value: Editing) => void;
};

/** Project creation, renaming and duplication share one named authoring boundary. */
export function useAssetAuthoringCommands(input: AuthoringInput) {
  const [error, setError] = useState("");
  const pending = useRef(false), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const createMaterial = useCallback(() => {
    const id = input.createMaterial();
    input.folders.moveItem("material", id, input.path);
    input.focusOne(`material:${id}`);
  }, [input]);
  const createAvatarMask = useCallback(() => {
    const id = input.characterAssets.createMask();
    input.folders.moveItem("avatarMask", id, input.path);
    input.focusOne(`avatarMask:${id}`);
  }, [input]);
  const createInputActionMap = useCallback(async () => {
    if (pending.current) return;
    pending.current = true; setError("");
    try {
      const { createInputActionMapAsset } = await import("../../input/adapters/input-action-map-api");
      const { asset } = await createInputActionMapAsset("Controls", { version: 1, actions: [] }, input.path);
      input.refreshAssets();
      if (mounted.current) input.focusOne(`inputActionMap:${asset.filename}`);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure));
    } finally { pending.current = false; }
  }, [input]);
  const renameEntry = useCallback((entry: AssetCatalogEntry, name: string) => {
    if (entry.kind === "scene" || entry.kind === "modelSubAsset") return;
    if (entry.kind === "folder") input.folders.renameFolder(entry.path, name);
    else if (entry.kind === "material") input.updateMaterial(entry.material.id, { name });
    else if (entry.kind === "avatarMask") input.characterAssets.renameMask(entry.asset.id, name);
    else {
      input.folders.setDisplayName(entry.kind, entry.asset.filename, name);
      if (entry.kind === "prefab") input.onPrefabDisplayNameChange?.(entry.asset.filename, name.trim() || entry.asset.name);
    }
    input.finishEditing(null);
  }, [input]);
  const duplicateFocusedMaterial = useCallback((id: string) => {
    const nextId = input.duplicateMaterial(id);
    if (!nextId) return;
    input.folders.moveItem("material", nextId, input.path);
    input.focusOne(`material:${nextId}`);
  }, [input]);
  return { createMaterial, createAvatarMask, createInputActionMap, renameEntry, duplicateFocusedMaterial, error };
}
