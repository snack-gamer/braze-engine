import { describe, expect, it } from "vitest";
import type { SceneObject } from "../../types";
import {
  deleteObjectSubtrees,
  duplicateObjectSubtrees,
  insertParentAboveSelection,
  moveObjectInTree,
} from "./object-tree";

function object(id: string, patch: Partial<SceneObject> = {}): SceneObject {
  return {
    id,
    name: id,
    primitive: "cube",
    visible: true,
    locked: false,
    solo: false,
    color: "#ffffff",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...patch,
  };
}

describe("object-tree authoring", () => {
  it("duplicates a selected subtree and remaps its internal parent", () => {
    const objects = [
      object("root", { position: [2, 0, 0] }),
      object("child", { parentId: "root", position: [1, 0, 0] }),
      object("other"),
    ];
    const result = duplicateObjectSubtrees(objects, ["root"], {
      idSuffix: "copy",
      remapPrefabInstances: true,
      rootOffset: 0.5,
      createObjectId: (index) => `obj-test-${index}-copy`,
      createPrefabInstanceId: (index) => `prefab-inst-test-${index}-copy`,
    });

    expect(result.firstCloneId).toBe("obj-test-0-copy");
    expect(result.objects.slice(-2)).toMatchObject([
      { id: "obj-test-0-copy", parentId: undefined, position: [2.5, 0, 0.5] },
      { id: "obj-test-1-copy", parentId: "obj-test-0-copy", position: [1, 0, 0] },
    ]);
  });

  it("deletes descendants but refuses to remove the last required camera", () => {
    const objects = [
      object("camera", { primitive: "camera" }),
      object("root"),
      object("child", { parentId: "root" }),
    ];
    expect(deleteObjectSubtrees(objects, ["root"], { requireCamera: true }).map(({ id }) => id)).toEqual(["camera"]);
    expect(deleteObjectSubtrees(objects, ["camera"], { requireCamera: true })).toBe(objects);
  });

  it("inserts a parent without changing a selected object's world position", () => {
    const child = object("child", { position: [3, 0, 0] });
    const parent = object("parent", { position: [1, 0, 0] });
    const next = insertParentAboveSelection([child], [child.id], parent);
    expect(next.find(({ id }) => id === "child")).toMatchObject({
      parentId: "parent",
      position: [2, 0, 0],
    });
  });

  it("reparents atomically, preserves world position, and rejects cycles", () => {
    const source = object("source", { position: [3, 0, 0] });
    const target = object("target", { position: [10, 0, 0] });
    const moved = moveObjectInTree([source, target], "source", "target", "child");
    expect(moved.find(({ id }) => id === "source")).toMatchObject({
      parentId: "target",
      position: [-7, 0, 0],
    });

    const hierarchy = [object("root"), object("child", { parentId: "root" })];
    expect(moveObjectInTree(hierarchy, "root", "child", "child")).toBe(hierarchy);
  });
});
