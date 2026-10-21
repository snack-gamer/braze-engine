import { countUiAssetReferences } from "../../game-ui/application/ui-asset-references";
import { useSceneWorkspace } from "../../scene/components/SceneWorkspaceContext";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AssetKind } from "../../hooks/useAssetFolders";
import { useAssetFolders } from "../../hooks/useAssetFolders";
import type { LibraryAsset } from "../../lib/api";
import type { Material, SceneObject } from "../../types";
import type {
  AuthoredAvatarMask,
} from "../../character/domain/character-asset-library";
import { assetFilenameInsideFolder, pathInsideFolder, splitKey } from "./model";
import type { ItemKey, PendingDelete } from "./types";

export type AssetDeleteItem = { itemKind: AssetKind | "folder"; id: string; name: string };

type AssetDeletionInput = {
  folders: ReturnType<typeof useAssetFolders>;
  materials: readonly Material[];
  models: readonly LibraryAsset[];
  images: readonly LibraryAsset[];
  prefabs: readonly LibraryAsset[];
  hdris: readonly LibraryAsset[];
  fonts?: readonly LibraryAsset[];
  inputActionMaps: readonly LibraryAsset[];
  avatarMasks: readonly AuthoredAvatarMask[];
  objects: readonly SceneObject[];
  activeHdriUrl?: string;
  removeMaterial: (id: string) => void;
  removeModel: (filename: string) => void;
  removeImage: (filename: string) => void;
  removePrefab: (filename: string) => void;
  removeHdri: (filename: string) => void;
  removeInputActionMap: (filename: string) => void;
  removeAvatarMask: (id: string) => void;
  clearBrowseSelection: () => void;
};

export function useAssetDeletion(input: AssetDeletionInput) {
  const scenes = useSceneWorkspace();
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [error, setError] = useState("");
  const requestGeneration = useRef(0);
  useEffect(() => () => { requestGeneration.current++; }, []);

  const usageFor = useCallback((item: AssetDeleteItem): number => {
    if (item.itemKind === "material") {
      return input.objects.filter((object) => object.materialId === item.id).length;
    }
    if (item.itemKind === "avatarMask") {
      const id = item.id.toLowerCase();
      return input.objects.reduce((count, object) => count + (object.animator?.controller?.layers ?? []).filter(
        (layer) => layer.avatarMaskRef?.guid.toLowerCase() === id,
      ).length, 0);
    }
    if (item.itemKind === "hdri") return input.activeHdriUrl?.endsWith(`/${item.id}`) ? 1 : 0;
    if (item.itemKind === "prefab") {
      return input.objects.filter((object) => object.prefabLink?.prefabFilename === item.id).length;
    }
    if (item.itemKind !== "folder") {
      const asset = [...input.images, ...input.fonts ?? []].find((entry) => entry.filename === item.id);
      return countUiAssetReferences(input.objects, new Set([asset?.guid?.toLowerCase() ?? ""])) + input.objects.filter((object) => object.assetUrl?.endsWith(`/${item.id}`)).length;
    }

    const folderPath = item.id;
    const diskAssets = [...input.models, ...input.images, ...input.prefabs, ...input.inputActionMaps, ...input.fonts ?? []].filter((asset) =>
      assetFilenameInsideFolder(asset.filename, folderPath)
      || pathInsideFolder(input.folders.folderOf(assetKindFor(asset, input), asset.filename), folderPath),
    );
    const diskFilenames = new Set(diskAssets.map((asset) => asset.filename));
    const materialIds = new Set(input.materials.filter((material) =>
      pathInsideFolder(input.folders.folderOf("material", material.id), folderPath)
      || Boolean(material.sourceAssetFilename && assetFilenameInsideFolder(material.sourceAssetFilename, folderPath)),
    ).map((material) => material.id));
    const hdriFilenames = new Set(input.hdris.filter((asset) =>
      pathInsideFolder(input.folders.folderOf("hdri", asset.filename), folderPath),
    ).map((asset) => asset.filename));
    const maskIds = new Set(input.avatarMasks.filter((asset) =>
      pathInsideFolder(input.folders.folderOf("avatarMask", asset.id), folderPath),
    ).map((asset) => asset.id.toLowerCase()));
    const sceneUses = input.objects.filter((object) =>
      Boolean(object.materialId && materialIds.has(object.materialId))
      || Boolean(object.prefabLink?.prefabFilename && diskFilenames.has(object.prefabLink.prefabFilename))
      || Boolean(object.assetUrl && [...diskFilenames].some((filename) => object.assetUrl?.endsWith(`/${filename}`))),
    ).length;
    const environmentUse = input.activeHdriUrl
      && [...hdriFilenames].some((filename) => input.activeHdriUrl?.endsWith(`/${filename}`)) ? 1 : 0;
    const maskUses = input.objects.reduce((count, object) => count + (object.animator?.controller?.layers ?? []).filter(
      (layer) => Boolean(layer.avatarMaskRef?.guid && maskIds.has(layer.avatarMaskRef.guid.toLowerCase())),
    ).length, 0);
    return sceneUses + environmentUse + maskUses + countUiAssetReferences(input.objects, new Set(diskAssets.map((asset) => asset.guid?.toLowerCase() ?? "")));
  }, [input]);

  const deleteFolderTree = useCallback((folderPath: string) => {
    const modelAssets = assetsInsideFolder(input.models, "model", folderPath, input.folders);
    const imageAssets = assetsInsideFolder(input.images, "image", folderPath, input.folders);
    const prefabAssets = assetsInsideFolder(input.prefabs, "prefab", folderPath, input.folders);
    const fontAssets = assetsInsideFolder(input.fonts ?? [], "font", folderPath, input.folders);
    const inputAssets = assetsInsideFolder(input.inputActionMaps, "inputActionMap", folderPath, input.folders);
    const hdriAssets = input.hdris.filter((asset) =>
      pathInsideFolder(input.folders.folderOf("hdri", asset.filename), folderPath),
    );
    const materials = input.materials.filter((material) =>
      pathInsideFolder(input.folders.folderOf("material", material.id), folderPath)
      || Boolean(material.sourceAssetFilename && assetFilenameInsideFolder(material.sourceAssetFilename, folderPath)),
    );
    const masks = input.avatarMasks.filter((asset) =>
      pathInsideFolder(input.folders.folderOf("avatarMask", asset.id), folderPath),
    );
    const removeDiskFolder = [...modelAssets, ...imageAssets, ...prefabAssets, ...inputAssets, ...fontAssets]
      .some((asset) => assetFilenameInsideFolder(asset.filename, folderPath));
    const removedByFolder = (filename: string) => removeDiskFolder && assetFilenameInsideFolder(filename, folderPath);

    for (const material of materials) input.removeMaterial(material.id);
    for (const asset of hdriAssets) input.removeHdri(asset.filename);
    for (const asset of masks) input.removeAvatarMask(asset.id);
    if (removeDiskFolder) input.removeModel(folderPath);
    for (const asset of modelAssets) if (!removedByFolder(asset.filename)) input.removeModel(asset.filename);
    for (const asset of imageAssets) if (!removedByFolder(asset.filename)) input.removeImage(asset.filename);
    for (const asset of prefabAssets) if (!removedByFolder(asset.filename)) input.removePrefab(asset.filename);
    for (const asset of fontAssets) if (!removedByFolder(asset.filename)) input.removeModel(asset.filename);
    for (const asset of inputAssets) if (!removedByFolder(asset.filename)) input.removeInputActionMap(asset.filename);
    input.folders.deleteFolder(folderPath);
  }, [input]);

  const collectSelection = useCallback((selectedKeys: ReadonlySet<ItemKey>): AssetDeleteItem[] => {
    const items: AssetDeleteItem[] = [];
    for (const key of selectedKeys) {
      const [kind, id] = splitKey(key);
      if (kind === "scene") { items.push({ itemKind: kind, id, name: scenes?.getSnapshot().scenes.find((scene) => scene.id === id)?.name ?? id }); continue; }
      if (kind === "folder") items.push({ itemKind: kind, id, name: input.folders.basenameOf(id) || id });
      else if (kind === "material") items.push({ itemKind: kind, id, name: input.materials.find((item) => item.id === id)?.name ?? id });
      else items.push({ itemKind: kind, id, name: assetName(kind, id, input) });
    }
    return items;
  }, [input, scenes]);

  const requestDelete = useCallback(async (items: AssetDeleteItem[]) => {
    const request = ++requestGeneration.current;
    setError("");
    if (items.some((item) => item.itemKind === "scene")) {
      if (items.length !== 1) { scenes?.reportError("Select one scene at a time to delete."); return; }
      void scenes?.requestDeletion(items[0].id).then(input.clearBrowseSelection).catch(scenes.reportError); return;
    }
    if (items.length === 0) return;
    const usedCount = items.reduce((total, item) => total + usageFor(item), 0);
    const inputCandidates = input.inputActionMaps.filter((asset) => items.some((item) =>
      item.itemKind === "inputActionMap" ? asset.filename === item.id
        : item.itemKind === "folder" && (assetFilenameInsideFolder(asset.filename, item.id)
          || pathInsideFolder(input.folders.folderOf("inputActionMap", asset.filename), item.id))));
    let projectInputUses = 0;
    if (inputCandidates.length > 0) {
      try {
        const { countProjectInputReferences } = await import("../../input/adapters/input-action-map-references");
        projectInputUses = await countProjectInputReferences(inputCandidates);
      } catch (failure) {
        if (request === requestGeneration.current) setError(`Could not check Project input references: ${failure instanceof Error ? failure.message : String(failure)}`);
        return;
      }
      if (request !== requestGeneration.current) return;
    }
    const prompt = items.length === 1 ? `Delete "${items[0].name}"?` : `Delete ${items.length} items?`;
    const warning = usedCount > 0
      ? `\n\nWarning: ${usedCount} scene ${usedCount === 1 ? "reference uses" : "references use"} this asset. Deleting it may leave scene objects or lighting with missing files.`
      : "";
    setPendingDelete({
      title: items.length === 1 ? "Delete asset" : "Delete assets",
      message: `${prompt}${warning}${projectInputUses ? "\n\nProject input: this map is selected by the project. The saved GUID will remain and Play will report Missing Input Action Map until it is restored or cleared." : ""}`,
      run: () => deleteItems(items),
    });
  }, [usageFor, deleteFolderTree, input, scenes]);

  const deleteItems = useCallback((items: AssetDeleteItem[]) => {
    const deletedFolders = items.filter((item) => item.itemKind === "folder").map((item) => item.id);
    for (const folderPath of deletedFolders) deleteFolderTree(folderPath);
    for (const item of items) {
      if (item.itemKind === "folder" || deletedFolders.some((folder) => itemInsideFolder(item, folder, input))) continue;
      if (item.itemKind === "material") input.removeMaterial(item.id);
      else if (item.itemKind === "model" || item.itemKind === "font") input.removeModel(item.id);
      else if (item.itemKind === "image") input.removeImage(item.id);
      else if (item.itemKind === "prefab") input.removePrefab(item.id);
      else if (item.itemKind === "avatarMask") input.removeAvatarMask(item.id);
      else if (item.itemKind === "inputActionMap") input.removeInputActionMap(item.id);
      else if (item.itemKind === "hdri") input.removeHdri(item.id);
    }
    input.clearBrowseSelection();
  }, [deleteFolderTree, input]);

  return {
    pendingDelete,
    error,
    requestDelete,
    collectSelection,
    confirmDelete: () => {
      pendingDelete?.run();
      setPendingDelete(null);
    },
    cancelDelete: () => { requestGeneration.current++; setPendingDelete(null); },
  };
}

function assetsInsideFolder(
  assets: readonly LibraryAsset[],
  kind: "model" | "image" | "prefab" | "inputActionMap" | "font",
  folderPath: string,
  folders: ReturnType<typeof useAssetFolders>,
) {
  return assets.filter((asset) => assetFilenameInsideFolder(asset.filename, folderPath)
    || pathInsideFolder(folders.folderOf(kind, asset.filename), folderPath));
}

function itemInsideFolder(item: AssetDeleteItem, folder: string, input: AssetDeletionInput): boolean {
  if (item.itemKind === "folder") return false;
  if (item.itemKind === "material") {
    const material = input.materials.find((entry) => entry.id === item.id);
    return pathInsideFolder(input.folders.folderOf("material", item.id), folder)
      || Boolean(material?.sourceAssetFilename && assetFilenameInsideFolder(material.sourceAssetFilename, folder));
  }
  return assetFilenameInsideFolder(item.id, folder)
    || pathInsideFolder(input.folders.folderOf(item.itemKind, item.id), folder);
}

function assetName(kind: AssetKind, id: string, input: AssetDeletionInput): string {
  if (kind === "avatarMask") return input.avatarMasks.find((asset) => asset.id === id)?.name ?? id;
  const library = kind === "model"
    ? input.models
    : kind === "image"
      ? input.images
      : kind === "prefab"
        ? input.prefabs
        : kind === "hdri"
          ? input.hdris
          : kind === "inputActionMap" ? input.inputActionMaps : kind === "font" ? input.fonts ?? [] : [];
  return library.find((item) => item.filename === id)?.filename ?? id;
}

function assetKindFor(asset: LibraryAsset, input: AssetDeletionInput): "model" | "image" | "prefab" | "inputActionMap" | "font" {
  if (input.fonts?.includes(asset)) return "font";
  if (input.images.includes(asset)) return "image";
  if (input.prefabs.includes(asset)) return "prefab";
  if (input.inputActionMaps.includes(asset)) return "inputActionMap";
  return "model";
}
