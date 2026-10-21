import { describe, expect, it } from "vitest";
import type { SceneObject } from "../types";
import { canDeleteHierarchySelection, flattenHierarchyRows } from "./hierarchy-model";

function object(id: string, parentId?: string, primitive: SceneObject["primitive"] = "transform"): SceneObject {
  return {
    id,
    parentId,
    name: id,
    primitive,
    color: "#ffffff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

describe("hierarchy model", () => {
  it("flattens depth-first while preserving sibling order", () => {
    const objects = [object("root"), object("child-a", "root"), object("grandchild", "child-a"), object("child-b", "root")];
    expect(flattenHierarchyRows(objects, new Set()).map((row) => [row.object.id, row.depth, row.hasChildren])).toEqual([
      ["root", 0, true],
      ["child-a", 1, true],
      ["grandchild", 2, false],
      ["child-b", 1, false],
    ]);
  });

  it("skips collapsed descendants without losing the parent's child indicator", () => {
    const rows = flattenHierarchyRows(
      [object("root"), object("child", "root"), object("other")],
      new Set(["root"]),
    );
    expect(rows.map((row) => row.object.id)).toEqual(["root", "other"]);
    expect(rows[0].hasChildren).toBe(true);
  });

  it("describes visible ancestor continuations for tree connectors", () => {
    const rows = flattenHierarchyRows([
      object("root"),
      object("child-a", "root"),
      object("grandchild", "child-a"),
      object("child-b", "root"),
    ], new Set());
    expect(rows.map((row) => [row.object.id, row.guides])).toEqual([
      ["root", []],
      ["child-a", [true]],
      ["grandchild", [true, false]],
      ["child-b", [false]],
    ]);
  });

  it("marks a hidden object and its whole subtree inactive without touching siblings", () => {
    const hidden = { ...object("hidden", "root"), visible: false };
    const rows = flattenHierarchyRows([
      object("root"),
      hidden,
      object("under-hidden", "hidden"),
      object("sibling", "root"),
    ], new Set());
    expect(rows.map((row) => [row.object.id, row.inactive])).toEqual([
      ["root", false],
      ["hidden", true],
      ["under-hidden", true],
      ["sibling", false],
    ]);
  });

  it("flags only the first member of a prefab instance as its root", () => {
    const link = (sourceObjectId: string, instanceId = "inst-1") => ({
      prefabFilename: "crate.prefab", prefabName: "Crate", instanceId, sourceObjectId,
    });
    const rows = flattenHierarchyRows([
      { ...object("crate"), prefabLink: link("a") },
      { ...object("lid", "crate"), prefabLink: link("b") },
      { ...object("nested", "lid"), prefabLink: link("c", "inst-2") },
      object("plain"),
    ], new Set());
    expect(rows.map((row) => [row.object.id, row.prefabRoot])).toEqual([
      ["crate", true],
      ["lid", false],
      ["nested", true],
      ["plain", false],
    ]);
  });

  it("searches descendants and keeps their ancestor path visible regardless of collapse", () => {
    const root = object("root");
    root.name = "World";
    const group = object("group", "root");
    group.name = "Characters";
    const match = object("match", "group");
    match.name = "Hero Knight";
    const hidden = object("hidden", "root");
    hidden.name = "Terrain";
    const rows = flattenHierarchyRows([root, group, match, hidden], new Set(["root", "group"]), "knight");
    expect(rows.map((row) => [row.object.id, row.depth])).toEqual([
      ["root", 0],
      ["group", 1],
      ["match", 2],
    ]);
  });

  it("surfaces orphaned and cyclic authored objects exactly once", () => {
    const rows = flattenHierarchyRows([
      object("root"),
      object("orphan", "missing"),
      object("cycle-a", "cycle-b"),
      object("cycle-b", "cycle-a"),
    ], new Set());
    expect(rows.map((row) => row.object.id).sort()).toEqual(["cycle-a", "cycle-b", "orphan", "root"]);
    expect(new Set(rows.map((row) => row.object.id)).size).toBe(4);
  });

  it("handles deeply nested scenes without recursive stack growth", () => {
    const objects = Array.from({ length: 10_000 }, (_, index) =>
      object(`node-${index}`, index === 0 ? undefined : `node-${index - 1}`),
    );
    const rows = flattenHierarchyRows(objects, new Set());
    expect(rows).toHaveLength(10_000);
    expect(rows[rows.length - 1]).toMatchObject({ object: { id: "node-9999" }, depth: 9_999 });
  });

  it("checks descendants, protected roots, and the last camera before delete", () => {
    const objects = [
      object("camera", undefined, "camera"),
      object("root"),
      object("child", "root"),
      object("other"),
    ];
    expect(canDeleteHierarchySelection(objects, ["root"], { requireCamera: true })).toBe(true);
    expect(canDeleteHierarchySelection(objects, ["camera"], { requireCamera: true })).toBe(false);
    expect(canDeleteHierarchySelection(objects, ["root"], { lockedRootId: "root" })).toBe(false);
    expect(canDeleteHierarchySelection(objects, ["root", "other"], { requireCamera: false })).toBe(true);
  });
});
