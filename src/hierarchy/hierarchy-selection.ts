import type { HierarchyRow } from "./hierarchy-model";

export type HierarchySelectionResult = {
  selectedIds: Set<string>;
  anchorId: string;
};

export function selectHierarchyRow(
  visibleIds: readonly string[],
  selectedIds: ReadonlySet<string>,
  anchorId: string,
  objectId: string,
  gesture: { extend: boolean; toggle: boolean },
): HierarchySelectionResult {
  if (gesture.extend && anchorId) {
    const anchorIndex = visibleIds.indexOf(anchorId);
    const targetIndex = visibleIds.indexOf(objectId);
    if (anchorIndex !== -1 && targetIndex !== -1) {
      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      return { selectedIds: new Set(visibleIds.slice(start, end + 1)), anchorId };
    }
  }
  if (gesture.toggle) {
    const next = new Set(selectedIds);
    if (next.has(objectId)) next.delete(objectId);
    else next.add(objectId);
    return { selectedIds: next.size > 0 ? next : new Set([objectId]), anchorId: objectId };
  }
  return { selectedIds: new Set([objectId]), anchorId: objectId };
}

export function reconcileHierarchySelection(
  validIds: ReadonlySet<string>,
  selectedIds: ReadonlySet<string>,
  activeObjectId: string,
  anchorId: string,
): HierarchySelectionResult {
  const next = new Set(Array.from(selectedIds).filter((id) => validIds.has(id)));
  if (validIds.has(activeObjectId) && !next.has(activeObjectId)) {
    return { selectedIds: new Set([activeObjectId]), anchorId: activeObjectId };
  }
  return {
    selectedIds: next,
    anchorId: validIds.has(anchorId) ? anchorId : activeObjectId,
  };
}

export type HierarchyNavigationAction = {
  focusId?: string;
  collapseId?: string;
  expandId?: string;
};

export function hierarchyNavigationAction(
  rows: readonly HierarchyRow[],
  activeObjectId: string,
  collapsed: ReadonlySet<string>,
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End",
): HierarchyNavigationAction {
  if (rows.length === 0) return {};
  const index = Math.max(0, rows.findIndex((row) => row.object.id === activeObjectId));
  const current = rows[index];
  if (key === "Home") return { focusId: rows[0].object.id };
  if (key === "End") return { focusId: rows[rows.length - 1].object.id };
  if (key === "ArrowUp") return { focusId: rows[Math.max(0, index - 1)].object.id };
  if (key === "ArrowDown") return { focusId: rows[Math.min(rows.length - 1, index + 1)].object.id };
  if (key === "ArrowRight") {
    if (current.hasChildren && collapsed.has(current.object.id)) return { expandId: current.object.id };
    const next = rows[index + 1];
    if (current.hasChildren && next?.depth === current.depth + 1) return { focusId: next.object.id };
    return {};
  }
  if (current.hasChildren && !collapsed.has(current.object.id)) return { collapseId: current.object.id };
  if (!current.object.parentId) return {};
  return { focusId: current.object.parentId };
}
