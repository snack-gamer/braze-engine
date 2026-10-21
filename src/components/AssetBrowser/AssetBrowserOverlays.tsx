import { AssetContextMenu, type AssetMenuAction } from "./AssetContextMenu";
import { CatalogPalette } from "../../ui/CatalogPalette";
import { ConfirmModal } from "./ConfirmModal";
import { ModelFolderImportModal } from "./ModelFolderImportModal";
import { menuItemsFor, menuTitleFor } from "./menu-model";
import type { AssetBrowserMenu, ItemKey, PendingDelete } from "./types";

type AssetBrowserOverlaysProps = {
  menu: AssetBrowserMenu | null;
  selectedKeys: ReadonlySet<ItemKey>;
  favoriteKeys: ReadonlySet<ItemKey>;
  basenameOf: (path: string) => string;
  onMenuSelect: (action: AssetMenuAction) => void;
  onCloseMenu: () => void;
  pendingDelete: PendingDelete | null;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  folderImportOpen: boolean;
  folderImportBusy: boolean;
  folderImportDropActive: boolean;
  onFolderImportDropActive: (active: boolean) => void;
  onChooseFolderFiles: () => void;
  onFolderImportDrop: (dataTransfer: DataTransfer) => void;
  onCloseFolderImport: () => void;
};

export function AssetBrowserOverlays(props: AssetBrowserOverlaysProps) {
  const menuItems = props.menu ? menuItemsFor(
    props.menu,
    props.selectedKeys.size,
    props.menu.kind === "item" ? props.favoriteKeys.has(`${props.menu.itemKind}:${props.menu.id}`) : false,
  ) : [];
  return (
    <>
      {props.menu?.kind === "empty" && (
        <CatalogPalette
          title="Create"
          titleIcon="add"
          items={menuItems.map((item) => ({
            id: item.action,
            label: item.label,
            category: item.section ?? "Create",
            description: item.description ?? item.label,
            aliases: item.aliases,
            icon: item.icon,
          }))}
          onSelect={(action) => {
            props.onMenuSelect(action as AssetMenuAction);
            props.onCloseMenu();
          }}
          onClose={props.onCloseMenu}
        />
      )}
      {props.menu && props.menu.kind !== "empty" && (
        <AssetContextMenu
          x={props.menu.x}
          y={props.menu.y}
          title={menuTitleFor(props.menu, props.basenameOf)}
          items={menuItems}
          onSelect={props.onMenuSelect}
          onClose={props.onCloseMenu}
        />
      )}
      {props.pendingDelete && (
        <ConfirmModal
          title={props.pendingDelete.title}
          message={props.pendingDelete.message}
          onConfirm={props.onConfirmDelete}
          onCancel={props.onCancelDelete}
        />
      )}
      {props.folderImportOpen && (
        <ModelFolderImportModal
          busy={props.folderImportBusy}
          dropActive={props.folderImportDropActive}
          onDropActive={props.onFolderImportDropActive}
          onChooseFiles={props.onChooseFolderFiles}
          onDrop={props.onFolderImportDrop}
          onClose={props.onCloseFolderImport}
        />
      )}
    </>
  );
}
