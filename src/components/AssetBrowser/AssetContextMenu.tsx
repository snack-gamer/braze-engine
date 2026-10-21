import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import type { EditorIconName } from "../../ui/icons";

export type AssetMenuAction =
  | "new-scene"
  | "save-scene-copy"
  | "new-folder"
  | "new-material"
  | "new-avatar-mask"
  | "new-input-action-map"
  | "project-input-settings"
  | "import-model"
  | "import-model-folder"
  | "import-image"
  | "import-hdri"
  | "open"
  | "rename"
  | "duplicate"
  | "reveal"
  | "refresh-preview"
  | "toggle-favorite"
  | "delete";

export type AssetMenuItem = {
  action: AssetMenuAction;
  label: string;
  icon: EditorIconName;
  section?: string;
  description?: string;
  aliases?: readonly string[];
  danger?: boolean;
};

type AssetContextMenuProps = {
  x: number;
  y: number;
  title: string;
  items: AssetMenuItem[];
  onSelect: (action: AssetMenuAction) => void;
  onClose: () => void;
};

// Right-click menu for the asset browser. Same chrome as HierarchyContextMenu —
// hidden first paint, measured, then clamped to the viewport so it never spills.
export function AssetContextMenu({ x, y, title, items, onSelect, onClose }: AssetContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; visibility: "hidden" | "visible" }>(
    () => ({ left: -9999, top: -9999, visibility: "hidden" }),
  );

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const margin = 6;
    const maxLeft = window.innerWidth - node.offsetWidth - margin;
    const maxTop = window.innerHeight - node.offsetHeight - margin;
    setPos({
      left: Math.max(margin, Math.min(x, maxLeft)),
      top: Math.max(margin, Math.min(y, maxTop)),
      visibility: "visible",
    });
  }, [x, y]);

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const dismiss = () => onClose();
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="hier-menu asset-menu"
      role="menu"
      aria-label={title}
      style={{ left: pos.left, top: pos.top, visibility: pos.visibility }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) => (
        <div
          className="asset-menu__entry"
          data-section={item.section}
          key={`${item.action}-${index}`}
        >
          {item.section && item.section !== items[index - 1]?.section && (
            <div className="asset-menu__section">
              <span>{item.section}</span>
              <i />
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            title={item.description}
            className={`hier-menu__item ${item.danger ? "hier-menu__item--danger" : ""}`}
            onClick={() => {
              onSelect(item.action);
              onClose();
            }}
          >
            <span className="asset-menu__icon"><EditorIcon name={item.icon} size="control" /></span>
            <span className="asset-menu__label">{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

// Convenience builders so the parent doesn't repeat icon/label boilerplate.
export const menuItemNewFolder: AssetMenuItem = {
  action: "new-folder",
  label: "Folder",
  icon: "folder",
  section: "Create",
};
export const menuItemNewMaterial: AssetMenuItem = {
  action: "new-material",
  label: "Material",
  icon: "add",
  section: "Rendering",
};
export const menuItemNewAvatarMask: AssetMenuItem = {
  action: "new-avatar-mask",
  label: "Avatar Mask",
  icon: "avatar",
  section: "Animation",
};
export const menuItemImportModel: AssetMenuItem = {
  action: "import-model",
  label: "Import Files…",
  icon: "assetModel",
  section: "Import",
};
export const menuItemImportModelFolder: AssetMenuItem = {
  action: "import-model-folder",
  label: "Import Model Folder…",
  icon: "folder",
  section: "Import",
};
export const menuItemImportImage: AssetMenuItem = {
  action: "import-image",
  label: "Import Image…",
  icon: "assetImage",
  section: "Import",
};
export const menuItemImportHdri: AssetMenuItem = {
  action: "import-hdri",
  label: "Import HDRI…",
  icon: "assetHdri",
  section: "Import",
};
export const menuItemOpen: AssetMenuItem = {
  action: "open",
  label: "Open",
  icon: "folderOpen",
};
export const menuItemRename: AssetMenuItem = {
  action: "rename",
  label: "Rename",
  icon: "rename",
};
export const menuItemDuplicate: AssetMenuItem = {
  action: "duplicate",
  label: "Duplicate",
  icon: "duplicate",
};
export const menuItemReveal: AssetMenuItem = {
  action: "reveal",
  label: "Reveal in Finder",
  icon: "reveal",
};
export const menuItemRefreshPreview: AssetMenuItem = {
  action: "refresh-preview",
  label: "Refresh Preview",
  icon: "refresh",
};
export const menuItemFavorite: AssetMenuItem = {
  action: "toggle-favorite",
  label: "Favorite",
  icon: "favorite",
};
export const menuItemDelete: AssetMenuItem = {
  action: "delete",
  label: "Delete",
  icon: "delete",
  danger: true,
};

export const menuItemNewScene: AssetMenuItem = { action: "new-scene", label: "Scene", icon: "sceneDocument", section: "World" };

export const menuItemSaveSceneCopy: AssetMenuItem = { action: "save-scene-copy", label: "Save Copy…", icon: "duplicate" };
