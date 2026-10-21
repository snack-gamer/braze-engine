import { activeSceneInstance } from "../../scene/domain/scene-session";
import { useSceneWorkspace } from "../../scene/components/SceneWorkspaceContext";
import { useCallback, type RefObject } from "react";
import type { AssetKind, FolderPath } from "../../hooks/useAssetFolders";
import { useAssetFolders } from "../../hooks/useAssetFolders";
import type { LibraryAsset } from "../../lib/api";
import type { AssetMenuAction } from "./AssetContextMenu";
import type { AssetCatalogEntry } from "./asset-catalog";
import type { AssetDeleteItem } from "./useAssetDeletion";
import type { AssetBrowserMenu, ItemKey } from "./types";
import type { ProjectCharacterAssetBridge } from "../../character/application/useProjectCharacterAssets";
import { requestAnimationClipEditor } from "../../animation/application/animation-clip-editor-channel";

type AssetMenuCommandsInput = {
  menu: AssetBrowserMenu | null;
  path: FolderPath;
  folders: ReturnType<typeof useAssetFolders>;
  selectedKeys: ReadonlySet<ItemKey>;
  models: readonly LibraryAsset[];
  images: readonly LibraryAsset[];
  prefabs: readonly LibraryAsset[];
  hdris: readonly LibraryAsset[];
  fonts?: readonly LibraryAsset[];
  inputActionMaps: readonly LibraryAsset[];
  characterAssets: ProjectCharacterAssetBridge;
  activeObjectId?: string;
  modelUploadRef: RefObject<HTMLInputElement | null>;
  imageUploadRef: RefObject<HTMLInputElement | null>;
  onOpenFolder: (path: FolderPath) => void;
  onCreateFolder: (parent: FolderPath) => void;
  onRename: (kind: "folder" | AssetKind, id: string) => void;
  onNewMaterial: () => void;
  onNewAvatarMask: () => void;
  onNewInputActionMap: () => void;
  onProjectInputSettings: () => void;
  onOpenAvatarMask: (id: string) => void;
  onOpenFolderImport: () => void;
  onImportHdri: () => void;
  onRequestDelete: (items: AssetDeleteItem[]) => void;
  collectSelection: (keys: ReadonlySet<ItemKey>) => AssetDeleteItem[];
  focusOne: (key: ItemKey) => void;
  markRecent: (key: ItemKey) => void;
  toggleFavorite: (key: ItemKey) => void;
  duplicateMaterial: (id: string) => string | null;
  duplicateModel: (id: string) => Promise<LibraryAsset | null>;
  duplicateImage: (id: string) => Promise<LibraryAsset | null>;
  duplicatePrefab: (id: string) => Promise<LibraryAsset | null>;
  duplicateHdri: (id: string) => Promise<LibraryAsset | null>;
  addModelToScene: (asset: LibraryAsset) => void;
  addImageToScene: (asset: LibraryAsset) => void;
  addPrefabToScene: (asset: LibraryAsset) => void;
  applyHdri: (asset: LibraryAsset) => void;
  assignMaterial: (materialId: string) => void;
  revealModel: (id: string) => void;
  revealImage: (id: string) => void;
  revealPrefab: (id: string) => void;
  revealHdri: (id: string) => void;
  refreshAssets: () => void;
  refreshHdris: () => void;
};

export function useAssetMenuCommands(input: AssetMenuCommandsInput) {
  const scenes = useSceneWorkspace();
  const activate = useCallback((kind: AssetKind, id: string) => {
    if (kind === "scene") {
      void scenes?.open(id).then(() => input.markRecent(`scene:${id}`)).catch(scenes.reportError);
      return;
    }
    if (kind === "avatarMask") {
      input.markRecent(`avatarMask:${id}`);
      input.onOpenAvatarMask(id);
      return;
    }
    const asset = findAsset(kind, id, input);
    if (kind === "material") {
      if (input.activeObjectId) {
        input.markRecent(`material:${id}`);
        input.assignMaterial(id);
      }
    } else if (asset) {
      input.markRecent(`${kind}:${id}`);
      if (kind === "model") input.addModelToScene(asset);
      else if (kind === "image") input.addImageToScene(asset);
      else if (kind === "prefab") input.addPrefabToScene(asset);
      else if (kind === "hdri") input.applyHdri(asset);
      else if (kind === "inputActionMap" || kind === "font") input.focusOne(`${kind}:${id}`);
    }
  }, [input, scenes]);

  const activateEntry = useCallback((entry: AssetCatalogEntry) => {
    if (entry.kind === "folder") input.onOpenFolder(entry.path);
    else if (entry.kind === "modelSubAsset") {
      if (entry.subAsset.kind === "clip" && entry.subAsset.importEnabled !== false) {
        requestAnimationClipEditor({
          filename: entry.asset.filename,
          localId: entry.subAsset.localId,
        });
      }
    }
    else if (entry.kind === "scene") activate("scene", entry.scene.id);
    else if (entry.kind === "material") activate("material", entry.material.id);
    else if (entry.kind === "avatarMask") activate("avatarMask", entry.asset.id);
    else activate(entry.kind, entry.asset.filename);
  }, [activate, input.onOpenFolder]);

  const duplicate = useCallback((kind: AssetKind, id: string) => {
    if (kind === "material") {
      const nextId = input.duplicateMaterial(id);
      if (nextId) {
        input.folders.moveItem("material", nextId, input.path);
        input.focusOne(`material:${nextId}`);
      }
      return;
    }
    if (kind === "avatarMask") {
      const nextId = input.characterAssets.duplicateMask(id);
      if (nextId) {
        input.folders.moveItem("avatarMask", nextId, input.folders.folderOf("avatarMask", id));
        input.focusOne(`avatarMask:${nextId}`);
      }
      return;
    }
    if (kind !== "model" && kind !== "image" && kind !== "prefab" && kind !== "hdri" && kind !== "inputActionMap" && kind !== "font") return;
    const operation = kind === "model" || kind === "inputActionMap" || kind === "font"
      ? input.duplicateModel(id)
      : kind === "image"
        ? input.duplicateImage(id)
        : kind === "prefab"
          ? input.duplicatePrefab(id)
          : input.duplicateHdri(id);
    void operation.then((asset) => {
      if (!asset) return;
      input.folders.moveItem(kind, asset.filename, input.path);
      input.focusOne(`${kind}:${asset.filename}`);
    });
  }, [input]);

  const handleMenuSelect = useCallback((action: AssetMenuAction) => {
    const menu = input.menu;
    if (!menu) return;
    if (action === "new-scene") { scenes?.showDialog("new"); return; }
    if (menu.kind === "empty") {
      if (action === "new-folder") input.onCreateFolder(input.path);
      else if (action === "new-material") input.onNewMaterial();
      else if (action === "new-avatar-mask") input.onNewAvatarMask();
      else if (action === "new-input-action-map") input.onNewInputActionMap();
      else if (action === "project-input-settings") input.onProjectInputSettings();
      else if (action === "import-model") input.modelUploadRef.current?.click();
      else if (action === "import-model-folder") input.onOpenFolderImport();
      else if (action === "import-image") input.imageUploadRef.current?.click();
      else if (action === "import-hdri") input.onImportHdri();
      return;
    }
    if (menu.kind === "folder") {
      if (action === "open") input.onOpenFolder(menu.path);
      else if (action === "new-folder") input.onCreateFolder(menu.path);
      else if (action === "rename") input.onRename("folder", menu.path);
      else if (action === "delete") {
        input.onRequestDelete([{ itemKind: "folder", id: menu.path, name: input.folders.basenameOf(menu.path) }]);
      }
      return;
    }
    if (menu.itemKind === "scene" && action !== "open" && action !== "toggle-favorite") {
      if (action === "delete") { void scenes?.requestDeletion(menu.id).catch(scenes.reportError); return; }
      if (scenes && menu.id === activeSceneInstance(scenes.getSnapshot().session).sceneId) {
        if (action === "rename") scenes.showDialog("rename");
        if (action === "save-scene-copy") scenes.showDialog("copy");
      }
      return;
    }
    if (action === "open") activate(menu.itemKind, menu.id);
    else if (action === "rename") input.onRename(menu.itemKind, menu.id);
    else if (action === "duplicate") duplicate(menu.itemKind, menu.id);
    else if (action === "reveal") reveal(menu.itemKind, menu.id, input);
    else if (action === "refresh-preview") menu.itemKind === "hdri" ? input.refreshHdris() : input.refreshAssets();
    else if (action === "toggle-favorite") input.toggleFavorite(`${menu.itemKind}:${menu.id}`);
    else if (action === "delete") {
      const key = `${menu.itemKind}:${menu.id}`;
      input.onRequestDelete(input.selectedKeys.has(key) && input.selectedKeys.size > 1
        ? input.collectSelection(input.selectedKeys)
        : [{ itemKind: menu.itemKind, id: menu.id, name: menu.name }]);
    }
  }, [activate, duplicate, input, scenes]);

  return { activateEntry, handleMenuSelect };
}

function findAsset(kind: AssetKind, id: string, input: AssetMenuCommandsInput): LibraryAsset | undefined {
  const source = kind === "model"
    ? input.models
    : kind === "image"
      ? input.images
      : kind === "prefab"
        ? input.prefabs
        : kind === "hdri"
          ? input.hdris
          : kind === "inputActionMap" ? input.inputActionMaps : kind === "font" ? input.fonts ?? [] : [];
  return source.find((asset) => asset.filename === id);
}

function reveal(kind: AssetKind, id: string, input: AssetMenuCommandsInput) {
  if (kind === "model" || kind === "inputActionMap" || kind === "font") input.revealModel(id);
  else if (kind === "image") input.revealImage(id);
  else if (kind === "prefab") input.revealPrefab(id);
  else if (kind === "hdri") input.revealHdri(id);
}
