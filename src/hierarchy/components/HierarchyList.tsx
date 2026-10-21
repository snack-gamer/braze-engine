import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import {
  hierarchyDropPosition,
  orderedMovableHierarchyIds,
  parseDraggedHierarchyIds,
  type HierarchyDropPosition,
  type HierarchyDropTarget,
} from "../hierarchy-drop";
import type { HierarchyRow as HierarchyRowModel } from "../hierarchy-model";
import { HIERARCHY_ROW_HEIGHT, hierarchyWindowRange } from "../hierarchy-window";
import type { Material, SceneObject } from "../../types";
import { HierarchyRow } from "./HierarchyRow";
import type { HierarchySelectionController } from "../hooks/useHierarchySelection";
import { useHierarchyRowHeight } from "../hooks/useHierarchyRowHeight";
import type { HierarchyDensity } from "../hierarchy-density";

type HierarchyListProps = {
  rows: HierarchyRowModel[];
  density: HierarchyDensity;
  hasSolo: boolean;
  activeObjectId: string;
  activeCameraId: string;
  viewThroughCameraId: string | null;
  collapsed: ReadonlySet<string>;
  toggleCollapsed: (id: string) => void;
  lockedRootId: string | null;
  trailingDropTarget: HierarchyDropTarget | null;
  selection: HierarchySelectionController;
  materials: Material[];
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
  assignMaterialToObject: (objectId: string, materialId: string | null) => void;
  lookThroughCamera: (id: string) => void;
  frameObject: (id: string) => void;
  openContextMenu: (objectId: string, x: number, y: number) => void;
  moveObject: (sourceId: string, targetId: string, position: HierarchyDropPosition) => void;
};

type DropZone = HierarchyDropTarget & { surface: "row" | "tail" };

export function HierarchyList(props: HierarchyListProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const focusedRequestRef = useRef<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(440);
  const [dropZone, setDropZone] = useState<DropZone | null>(null);
  const [draggingRowIds, setDraggingRowIds] = useState<Set<string>>(new Set());
  const rowHeight = useHierarchyRowHeight(listRef, props.density);
  const range = useMemo(
    () => hierarchyWindowRange(props.rows.length, scrollTop, viewportHeight, rowHeight),
    [props.rows.length, scrollTop, viewportHeight, rowHeight],
  );
  const windowedRows = props.rows.slice(range.start, range.end);
  const tailMinHeight = Math.max(64, viewportHeight - props.rows.length * rowHeight);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const measure = () => setViewportHeight(Math.max(HIERARCHY_ROW_HEIGHT, node.clientHeight));
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const targetId = props.selection.keyboardFocusId ?? props.selection.editingId ?? props.activeObjectId;
    const index = props.rows.findIndex((row) => row.object.id === targetId);
    const node = listRef.current;
    if (index < 0 || !node) return;
    const rowTop = index * rowHeight;
    const rowBottom = rowTop + rowHeight;
    let nextScrollTop = node.scrollTop;
    if (rowTop < node.scrollTop) nextScrollTop = rowTop;
    else if (rowBottom > node.scrollTop + node.clientHeight) nextScrollTop = rowBottom - node.clientHeight;
    if (nextScrollTop !== node.scrollTop) {
      node.scrollTop = nextScrollTop;
      setScrollTop(nextScrollTop);
      return;
    }
    if (
      props.selection.keyboardFocusId === targetId
      && focusedRequestRef.current !== targetId
    ) {
      const row = Array.from(node.querySelectorAll<HTMLElement>("[data-hierarchy-object-id]"))
        .find((element) => element.dataset.hierarchyObjectId === targetId);
      if (row) {
        row.focus();
        focusedRequestRef.current = targetId;
      }
    }
  }, [props.activeObjectId, props.rows, props.selection.editingId, props.selection.keyboardFocusId, rowHeight, scrollTop]);

  const onContextMenu = useCallback((event: MouseEvent, objectId: string) => {
    event.preventDefault();
    props.selection.selectForContextMenu(objectId);
    props.openContextMenu(objectId, event.clientX, event.clientY);
  }, [props.openContextMenu, props.selection]);

  const onDragStart = useCallback((event: DragEvent, objectId: string) => {
    if (objectId === props.lockedRootId) {
      event.preventDefault();
      return;
    }
    const dragIds = props.selection.idsForRowAction(objectId).filter((id) => id !== props.lockedRootId);
    if (!props.selection.selectedIds.has(objectId)) props.selection.selectForContextMenu(objectId);
    setDraggingRowIds(new Set(dragIds));
    event.dataTransfer.setData("application/x-tgan-row", objectId);
    event.dataTransfer.setData("application/x-tgan-rows", JSON.stringify(dragIds));
    event.dataTransfer.effectAllowed = "move";
  }, [props.lockedRootId, props.selection]);

  const onDragOver = useCallback((event: DragEvent, objectId: string) => {
    const types = event.dataTransfer.types;
    const isRow = types.includes("application/x-tgan-row") || types.includes("application/x-tgan-rows");
    const isMaterial = types.includes("application/x-tgan-material");
    if (!isRow && !isMaterial) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = isMaterial ? "link" : "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const position = isMaterial ? "child" : hierarchyDropPosition(event.clientY, rect.top, rect.height);
    setDropZone((current) => current?.surface === "row" && current.targetId === objectId && current.position === position
      ? current
      : { targetId: objectId, position, surface: "row" });
  }, []);

  const onDrop = useCallback((event: DragEvent, targetId: string) => {
    const types = event.dataTransfer.types;
    if (types.includes("application/x-tgan-material")) {
      event.preventDefault();
      const materialId = event.dataTransfer.getData("application/x-tgan-material");
      setDropZone(null);
      if (materialId) props.assignMaterialToObject(targetId, materialId);
      return;
    }
    if (!types.includes("application/x-tgan-row") && !types.includes("application/x-tgan-rows")) return;
    event.preventDefault();
    const sourceIds = parseDraggedHierarchyIds(
      event.dataTransfer.getData("application/x-tgan-rows"),
      event.dataTransfer.getData("application/x-tgan-row"),
    );
    const position = dropZone?.surface === "row" && dropZone.targetId === targetId
      ? dropZone.position
      : "child";
    setDropZone(null);
    setDraggingRowIds(new Set());
    for (const sourceId of orderedMovableHierarchyIds(sourceIds, targetId, position, props.lockedRootId)) {
      props.moveObject(sourceId, targetId, position);
    }
    if (position === "child" && props.collapsed.has(targetId)) props.toggleCollapsed(targetId);
  }, [dropZone, props]);

  const onTailDragOver = useCallback((event: DragEvent) => {
    const target = props.trailingDropTarget;
    const types = event.dataTransfer.types;
    if (!target || (!types.includes("application/x-tgan-row") && !types.includes("application/x-tgan-rows"))) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropZone((current) => current?.surface === "tail"
      && current.targetId === target.targetId
      && current.position === target.position
      ? current
      : { ...target, surface: "tail" });
  }, [props.trailingDropTarget]);

  const onTailDrop = useCallback((event: DragEvent) => {
    const target = props.trailingDropTarget;
    if (!target) return;
    const types = event.dataTransfer.types;
    if (!types.includes("application/x-tgan-row") && !types.includes("application/x-tgan-rows")) return;
    event.preventDefault();
    const sourceIds = parseDraggedHierarchyIds(
      event.dataTransfer.getData("application/x-tgan-rows"),
      event.dataTransfer.getData("application/x-tgan-row"),
    );
    setDropZone(null);
    setDraggingRowIds(new Set());
    for (const sourceId of orderedMovableHierarchyIds(
      sourceIds,
      target.targetId,
      target.position,
      props.lockedRootId,
    )) {
      props.moveObject(sourceId, target.targetId, target.position);
    }
    if (target.position === "child" && props.collapsed.has(target.targetId)) {
      props.toggleCollapsed(target.targetId);
    }
  }, [props]);

  const onDragEnd = useCallback((objectId: string) => {
    window.dispatchEvent(new CustomEvent("tgan:hierarchy-drag-end", {
      detail: { ids: Array.from(draggingRowIds.size > 0 ? draggingRowIds : new Set([objectId])) },
    }));
    setDropZone(null);
    setDraggingRowIds(new Set());
  }, [draggingRowIds]);

  return (
    <div
      ref={listRef}
      className={`object-list ${draggingRowIds.size > 0 ? "hierarchy-row-dragging" : ""}`}
      data-hierarchy-density={props.density}
      role="tree"
      aria-label="Scene objects"
      aria-multiselectable="true"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      {range.beforeHeight > 0 && (
        <div className="hierarchy-virtual-spacer" style={{ height: range.beforeHeight }} aria-hidden />
      )}
      {windowedRows.map((row, offset) => {
        const index = range.start + offset;
        const object = row.object;
        return (
          <HierarchyRow
            key={object.id}
            row={row}
            rowIndex={index}
            activeObjectId={props.activeObjectId}
            activeCameraId={props.activeCameraId}
            viewThroughCameraId={props.viewThroughCameraId}
            selected={props.selection.selectedIds.has(object.id)}
            collapsed={props.collapsed.has(object.id)}
            dragging={draggingRowIds.has(object.id)}
            dimmedBySolo={props.hasSolo && !object.solo}
            dropPosition={dropZone?.surface === "row" && dropZone.targetId === object.id ? dropZone.position : null}
            lockedRootId={props.lockedRootId}
            editing={props.selection.editingId === object.id}
            renameDraft={props.selection.renameDraft}
            materials={props.materials}
            onSelect={props.selection.selectRow}
            onFrame={props.frameObject}
            onContextMenu={onContextMenu}
            onToggleCollapsed={props.toggleCollapsed}
            onRenameDraftChange={props.selection.setRenameDraft}
            onCommitRename={props.selection.commitRename}
            onCancelRename={props.selection.cancelRename}
            onUpdateObject={props.updateObject}
            onAssignMaterial={props.assignMaterialToObject}
            onLookThroughCamera={props.lookThroughCamera}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={(id) => setDropZone((current) => (
              current?.surface === "row" && current.targetId === id ? null : current
            ))}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          />
        );
      })}
      {range.afterHeight > 0 && (
        <div className="hierarchy-virtual-spacer" style={{ height: range.afterHeight }} aria-hidden />
      )}
      {props.rows.length === 0 && <div className="object-list-empty">No objects match this search.</div>}
      <div
        className={`hierarchy-tail-drop-zone ${dropZone?.surface === "tail" ? "active" : ""}`}
        data-hierarchy-tail-drop
        style={{ minHeight: tailMinHeight }}
        role="presentation"
        onDragOver={onTailDragOver}
        onDragLeave={() => setDropZone((current) => current?.surface === "tail" ? null : current)}
        onDrop={onTailDrop}
      >
        <span>Move to end of root hierarchy</span>
      </div>
    </div>
  );
}
