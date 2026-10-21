import {
  menuItemDelete,
  menuItemDuplicate,
  menuItemFavorite,
  menuItemImportHdri,
  menuItemImportImage,
  menuItemImportModel,
  menuItemImportModelFolder,
  menuItemNewFolder,
  menuItemNewScene,
  menuItemSaveSceneCopy,
  menuItemNewMaterial,
  menuItemNewAvatarMask,
  menuItemOpen,
  menuItemRefreshPreview,
  menuItemRename,
  menuItemReveal,
} from "./AssetContextMenu";
import { inputActionMapPresentation } from "../../input/presentation/input-action-map-presentation";
import type { AssetMenuItem } from "./AssetContextMenu";
import type { AssetBrowserMenu } from "./types";

const newInputActionMap: AssetMenuItem = { action: "new-input-action-map", label: inputActionMapPresentation.label,
  icon: inputActionMapPresentation.icon, section: inputActionMapPresentation.category,
  description: inputActionMapPresentation.description, aliases: inputActionMapPresentation.aliases };

export function menuTitleFor(menu: AssetBrowserMenu, basenameOf: (path: string) => string): string {
  if (menu.kind === "empty") return "Create or Import";
  if (menu.kind === "folder") return basenameOf(menu.path) || "Folder";
  return menu.name;
}

export function menuItemsFor(menu: AssetBrowserMenu, selectionSize: number, isFavorite = false) {
  if (menu.kind === "empty") {
    return [
      menuItemNewFolder,
      menuItemNewScene,
      menuItemNewAvatarMask,
      menuItemNewMaterial,
      newInputActionMap,
      { action: "project-input-settings" as const, label: "Project Input Settings", icon: inputActionMapPresentation.icon, section: inputActionMapPresentation.category },
      menuItemImportModel,
      menuItemImportModelFolder,
      menuItemImportImage,
      menuItemImportHdri,
    ];
  }
  if (menu.kind === "folder") {
    return [menuItemOpen, menuItemNewFolder, menuItemRename, menuItemDelete];
  }
  const deleteItem = selectionSize > 1
    ? { ...menuItemDelete, label: `Delete ${selectionSize}` }
    : menuItemDelete;
  const favoriteItem = isFavorite
    ? { ...menuItemFavorite, label: "Unfavorite" }
    : menuItemFavorite;
  if (menu.itemKind === "scene") return menu.activeScene
    ? [menuItemOpen, menuItemRename, menuItemSaveSceneCopy, favoriteItem, menuItemDelete]
    : [menuItemOpen, favoriteItem, menuItemDelete];
  if (menu.itemKind === "material") {
    return [menuItemOpen, menuItemRename, menuItemDuplicate, favoriteItem, deleteItem];
  }
  if (menu.itemKind === "avatarMask") {
    return [menuItemOpen, menuItemRename, menuItemDuplicate, favoriteItem, deleteItem];
  }
  if (menu.itemKind === "inputActionMap" || menu.itemKind === "font") return [menuItemOpen, menuItemRename, menuItemDuplicate, menuItemReveal, favoriteItem, deleteItem];
  return [
    menuItemOpen,
    menuItemRename,
    menuItemDuplicate,
    menuItemReveal,
    menuItemRefreshPreview,
    favoriteItem,
    deleteItem,
  ];
}
