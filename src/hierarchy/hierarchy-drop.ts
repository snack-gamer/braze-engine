export type HierarchyDropPosition = "before" | "child" | "after";

export type HierarchyDropTarget = {
  targetId: string;
  position: HierarchyDropPosition;
};

export function hierarchyDropPosition(pointerY: number, rowTop: number, rowHeight: number): HierarchyDropPosition {
  const ratio = (pointerY - rowTop) / Math.max(1, rowHeight);
  if (ratio < 0.3) return "before";
  if (ratio > 0.7) return "after";
  return "child";
}

export function parseDraggedHierarchyIds(multiplePayload: string, singlePayload: string): string[] {
  if (multiplePayload) {
    try {
      const parsed: unknown = JSON.parse(multiplePayload);
      if (Array.isArray(parsed)) {
        return Array.from(new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0)));
      }
    } catch {
      // The compatible single-row payload is the fallback.
    }
  }
  return singlePayload ? [singlePayload] : [];
}

export function movableHierarchyIds(
  sourceIds: readonly string[],
  targetId: string,
  lockedRootId?: string | null,
): string[] {
  return Array.from(new Set(sourceIds)).filter((id) => id !== targetId && id !== lockedRootId);
}

/** Preserves authored row order when sequential moves share an after target. */
export function orderedMovableHierarchyIds(
  sourceIds: readonly string[],
  targetId: string,
  position: HierarchyDropPosition,
  lockedRootId?: string | null,
): string[] {
  const ids = movableHierarchyIds(sourceIds, targetId, lockedRootId);
  return position === "after" ? ids.reverse() : ids;
}

/** Resolves the semantic end of the editable root list, independent of filtering. */
export function trailingHierarchyDropTarget(
  objects: readonly { id: string; parentId?: string }[],
  lockedRootId?: string | null,
): HierarchyDropTarget | null {
  const validIds = new Set(objects.map((object) => object.id));
  const roots = lockedRootId
    ? objects.filter((object) => object.id !== lockedRootId && object.parentId === lockedRootId)
    : objects.filter((object) => !object.parentId || !validIds.has(object.parentId));
  const lastRoot = roots[roots.length - 1];
  if (lastRoot) return { targetId: lastRoot.id, position: "after" };
  return lockedRootId && validIds.has(lockedRootId)
    ? { targetId: lockedRootId, position: "child" }
    : null;
}
