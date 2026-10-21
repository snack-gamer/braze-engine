import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "../ui/EditorIcon";
import type { DockPaneDefinition, EditorDockController } from "./dock-workspace-types";
import type { DockPaneId } from "./layout";

type DockTabContextMenuProps = {
  x: number;
  y: number;
  pane: DockPaneId;
  groupId: string;
  panes: Record<DockPaneId, DockPaneDefinition>;
  controller: EditorDockController;
  closable: boolean;
  onClose: () => void;
};

type MenuPosition = {
  left: number;
  top: number;
  visibility: "hidden" | "visible";
};

/** Unity-style actions for one dock tab, rendered above every editor surface. */
export function DockTabContextMenu({
  x,
  y,
  pane,
  groupId,
  panes,
  controller,
  closable,
  onClose,
}: DockTabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<MenuPosition>({
    left: -9999,
    top: -9999,
    visibility: "hidden",
  });
  const maximized = controller.maximizedGroupId === groupId;
  const closedPanes = controller.document.closed;

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const margin = 6;
    setPosition({
      left: Math.max(margin, Math.min(x, window.innerWidth - menu.offsetWidth - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - menu.offsetHeight - margin)),
      visibility: "visible",
    });
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [x, y]);

  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const dismissOnKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const dismiss = () => onClose();
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnKey);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnKey);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
    };
  }, [onClose]);

  const run = (command: () => void) => {
    command();
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      className="editor-dock-tab-menu"
      role="menu"
      aria-label={`${panes[pane].title} tab options`}
      style={position}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="editor-dock-tab-menu__label">{panes[pane].title}</div>
      <button
        type="button"
        role="menuitem"
        className="editor-dock-tab-menu__item"
        onClick={() => run(() => controller.toggleMaximizeGroup(groupId))}
      >
        <EditorIcon name={maximized ? "restorePane" : "maximizePane"} size="control" />
        <span>{maximized ? "Restore" : "Maximize"}</span>
      </button>
      {closable && (
        <button
          type="button"
          role="menuitem"
          className="editor-dock-tab-menu__item"
          onClick={() => run(() => controller.closePane(pane))}
        >
          <EditorIcon name="close" size="control" />
          <span>Close Tab</span>
          <span className="editor-dock-tab-menu__hint">Middle-click</span>
        </button>
      )}
      {closedPanes.length > 0 && (
        <>
          <div className="editor-dock-tab-menu__divider" role="separator" />
          <div className="editor-dock-tab-menu__section">Add Tab</div>
          {closedPanes.map((closedPane) => (
            <button
              key={closedPane}
              type="button"
              role="menuitem"
              className="editor-dock-tab-menu__item"
              onClick={() => run(() => controller.dockPane(closedPane, pane, "center", "after"))}
            >
              <EditorIcon name={panes[closedPane].icon} size="control" />
              <span>{panes[closedPane].title}</span>
            </button>
          ))}
        </>
      )}
    </div>,
    document.body,
  );
}
