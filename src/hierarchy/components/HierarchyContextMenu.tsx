import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SceneObject } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";

type HierarchyContextMenuProps = {
  object: SceneObject;
  selectionCount: number;
  x: number;
  y: number;
  onClose: () => void;
  onCreateEmpty: () => void;
  onCreateEmptyParent: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onFrame: () => void;
  onSetActiveCamera?: () => void;
  onLookThrough?: () => void;
  onAlignView?: () => void;
  onDelete: () => void;
  canDelete: boolean;
  canCreateEmptyParent?: boolean;
  canDuplicate?: boolean;
  canRename?: boolean;
};

// Right-click menu for hierarchy rows. Closes on outside click, ESC, scroll,
// resize, or right-click on another row (HierarchyPanel re-opens with new coords).
// Positioned at the cursor and clamped to the viewport so it never spills
// off-screen on rows near the edge.
export function HierarchyContextMenu({
  object,
  selectionCount,
  x,
  y,
  onClose,
  onCreateEmpty,
  onCreateEmptyParent,
  onDuplicate,
  onRename,
  onFrame,
  onSetActiveCamera,
  onLookThrough,
  onAlignView,
  onDelete,
  canDelete,
  canCreateEmptyParent = true,
  canDuplicate = true,
  canRename = true,
}: HierarchyContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Render at (-9999, -9999) on first paint so we can measure size before
  // committing the final clamped position — avoids a one-frame flash at an
  // overflowing location.
  const [pos, setPos] = useState<{ left: number; top: number; visibility: "hidden" | "visible" }>(
    () => ({ left: -9999, top: -9999, visibility: "hidden" }),
  );

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const { offsetWidth: w, offsetHeight: h } = node;
    const margin = 6;
    const maxLeft = window.innerWidth - w - margin;
    const maxTop = window.innerHeight - h - margin;
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
    // Closing on scroll/resize is the standard native context-menu behavior
    // and keeps the menu from drifting away from the row that spawned it.
    const onViewportChange = () => onClose();
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [onClose]);

  const isCamera = object.primitive === "camera";
  const selectionLabel = selectionCount > 1 ? `${selectionCount} selected` : object.name || "(unnamed)";

  const run = (callback: () => void) => {
    callback();
    onClose();
  };

  return (
    <div
      ref={ref}
      className="hier-menu"
      role="menu"
      aria-label={`Actions for ${object.name || "object"}`}
      style={{ left: pos.left, top: pos.top, visibility: pos.visibility }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="hier-menu__label">{selectionLabel}</div>

      <HierarchyMenuItem icon="createEmpty" label="Create Empty" hint="Child transform" onSelect={() => run(onCreateEmpty)} />
      <HierarchyMenuItem
        icon="createParent"
        label="Create Empty Parent"
        hint="Wrap selection"
        onSelect={() => run(onCreateEmptyParent)}
        enabled={canCreateEmptyParent}
        disabledTitle="Prefab root can't be wrapped"
      />

      <div className="hier-menu__divider" role="separator" />
      <HierarchyMenuItem
        icon="duplicate"
        label="Duplicate"
        hint="Ctrl/⌘D"
        onSelect={() => run(onDuplicate)}
        enabled={canDuplicate}
        disabledTitle="Prefab root can't be duplicated"
      />
      <HierarchyMenuItem
        icon="rename"
        label="Rename"
        hint="F2"
        onSelect={() => run(onRename)}
        enabled={canRename}
        disabledTitle="Prefab root name is locked"
      />
      <HierarchyMenuItem icon="frameSelection" label="Frame Selected" hint="F" onSelect={() => run(onFrame)} />

      {isCamera && (onSetActiveCamera || onLookThrough || onAlignView) && (
        <>
          <div className="hier-menu__divider" role="separator" />
          {onSetActiveCamera && <HierarchyMenuItem icon="setActiveCamera" label="Set Active Camera" onSelect={() => run(onSetActiveCamera)} />}
          {onLookThrough && <HierarchyMenuItem icon="cameraView" label="Look Through" onSelect={() => run(onLookThrough)} />}
          {onAlignView && (
            <HierarchyMenuItem
              icon="alignView"
              label="Align View"
              hint="Snap camera to current view"
              onSelect={() => run(onAlignView)}
            />
          )}
        </>
      )}

      <div className="hier-menu__divider" role="separator" />
      <HierarchyMenuItem
        icon="delete"
        label="Delete"
        onSelect={() => run(onDelete)}
        enabled={canDelete}
        disabledTitle="Can't delete the last object / last camera"
        danger
      />
    </div>
  );
}

type HierarchyMenuItemProps = {
  icon: Parameters<typeof EditorIcon>[0]["name"];
  label: string;
  hint?: string;
  onSelect: () => void;
  enabled?: boolean;
  disabledTitle?: string;
  danger?: boolean;
};

function HierarchyMenuItem({
  icon,
  label,
  hint,
  onSelect,
  enabled = true,
  disabledTitle,
  danger = false,
}: HierarchyMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`hier-menu__item ${danger ? "hier-menu__item--danger" : ""}`}
      onClick={onSelect}
      disabled={!enabled}
      title={enabled ? undefined : disabledTitle}
    >
      <EditorIcon name={icon} size="control" />
      <span>{label}</span>
      {hint && <span className="hier-menu__hint">{hint}</span>}
    </button>
  );
}
