import { describe, expect, it } from "vitest";
import type { SceneObject } from "../types";
import {
  hierarchyDropPosition,
  movableHierarchyIds,
  orderedMovableHierarchyIds,
  parseDraggedHierarchyIds,
  trailingHierarchyDropTarget,
} from "./hierarchy-drop";
import type { HierarchyRow } from "./hierarchy-model";
import {
  hierarchyNavigationAction,
  reconcileHierarchySelection,
  selectHierarchyRow,
} from "./hierarchy-selection";

const visibleIds = ["a", "b", "c", "d"];

function row(id: string, depth: number, hasChildren = false, parentId?: string): HierarchyRow {
  const object: SceneObject = {
    id, parentId, name: id, primitive: "transform", color: "#fff", visible: true, locked: false,
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
  };
  return { object, depth, hasChildren, guides: Array.from({ length: depth }, () => false), inactive: false, prefabRoot: false };
}

describe("hierarchy selection", () => {
  it("supports replacement, range extension, and non-empty toggle selection", () => {
    expect(selectHierarchyRow(visibleIds, new Set(["a"]), "a", "c", { extend: false, toggle: false }).selectedIds)
      .toEqual(new Set(["c"]));
    expect(selectHierarchyRow(visibleIds, new Set(["a"]), "a", "c", { extend: true, toggle: false }).selectedIds)
      .toEqual(new Set(["a", "b", "c"]));
    expect(selectHierarchyRow(visibleIds, new Set(["b"]), "b", "b", { extend: false, toggle: true }).selectedIds)
      .toEqual(new Set(["b"]));
  });

  it("prunes stale selection and restores the active object", () => {
    const result = reconcileHierarchySelection(new Set(["b", "c"]), new Set(["gone"]), "c", "gone");
    expect(result).toEqual({ selectedIds: new Set(["c"]), anchorId: "c" });
  });

  it("replaces stale UI selection when another surface activates an object", () => {
    const result = reconcileHierarchySelection(new Set(["a", "b", "c"]), new Set(["a", "b"]), "c", "a");
    expect(result).toEqual({ selectedIds: new Set(["c"]), anchorId: "c" });
  });

  it("navigates visible rows and uses left/right for tree disclosure", () => {
    const rows = [row("root", 0, true), row("child", 1, false, "root"), row("other", 0)];
    expect(hierarchyNavigationAction(rows, "root", new Set(["root"]), "ArrowRight")).toEqual({ expandId: "root" });
    expect(hierarchyNavigationAction(rows, "root", new Set(), "ArrowRight")).toEqual({ focusId: "child" });
    expect(hierarchyNavigationAction(rows, "root", new Set(), "ArrowLeft")).toEqual({ collapseId: "root" });
    expect(hierarchyNavigationAction(rows, "child", new Set(), "ArrowLeft")).toEqual({ focusId: "root" });
    expect(hierarchyNavigationAction(rows, "child", new Set(), "End")).toEqual({ focusId: "other" });
  });
});

describe("hierarchy drop semantics", () => {
  it("resolves the three row drop zones at stable thresholds", () => {
    expect(hierarchyDropPosition(102, 100, 20)).toBe("before");
    expect(hierarchyDropPosition(106, 100, 20)).toBe("child");
    expect(hierarchyDropPosition(114, 100, 20)).toBe("child");
    expect(hierarchyDropPosition(119, 100, 20)).toBe("after");
  });

  it("parses multi-row payloads with a compatible single-row fallback", () => {
    expect(parseDraggedHierarchyIds('["a","b","a",4]', "fallback")).toEqual(["a", "b"]);
    expect(parseDraggedHierarchyIds("not json", "fallback")).toEqual(["fallback"]);
    expect(parseDraggedHierarchyIds("", "")).toEqual([]);
  });

  it("removes duplicates, the target, and a protected root from a move", () => {
    expect(movableHierarchyIds(["a", "root", "a", "target", "b"], "target", "root")).toEqual(["a", "b"]);
  });

  it("keeps multi-row order when rows are moved after the same target", () => {
    expect(orderedMovableHierarchyIds(["a", "b"], "target", "after")).toEqual(["b", "a"]);
    expect(orderedMovableHierarchyIds(["a", "b"], "target", "before")).toEqual(["a", "b"]);
  });

  it("targets the actual final root from the entire authored hierarchy", () => {
    expect(trailingHierarchyDropTarget([
      { id: "root-a" },
      { id: "child", parentId: "root-a" },
      { id: "root-b" },
    ])).toEqual({ targetId: "root-b", position: "after" });
    expect(trailingHierarchyDropTarget([
      { id: "prefab-root" },
      { id: "first", parentId: "prefab-root" },
      { id: "last", parentId: "prefab-root" },
    ], "prefab-root")).toEqual({ targetId: "last", position: "after" });
    expect(trailingHierarchyDropTarget([{ id: "prefab-root" }], "prefab-root"))
      .toEqual({ targetId: "prefab-root", position: "child" });
  });
});
