import { describe, expect, it } from "vitest";
import type { SceneObject } from "../../scene/domain/scene-object";
import type { BehaviorComponent } from "../domain/behavior-component";
import { duplicateObjectSubtrees } from "../../scene/authoring/object-tree";
import { duplicateActiveSceneObject } from "../../scene/authoring/scene-object-commands";
import { applyScenePatch } from "../../lib/prefab-authoring";
import { createPrefabDocument, instantiatePrefabDocument, updatePrefabLinkedInstances } from "../../lib/prefabs";

function object(id: string, parentId?: string): SceneObject {
  return { id, name: id, parentId, primitive: id === "root" ? "transform" : "cube", visible: true, locked: false,
    color: "#ffffff", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}
function component(): BehaviorComponent {
  return { version: 1, entries: [{ id: "follow", type: "project.follow", typeVersion: 1, enabled: true,
    values: { target: { entityId: "child" }, external: { entityId: "outside" }, speed: 2 } }] };
}
function prefab() {
  return createPrefabDocument([{ ...object("root"), behaviors: component() }, object("child", "root")], ["root"], "Pair")!;
}
const asset = { filename: "Pair.braze-prefab.json", name: "Pair", guid: "0123456789abcdef0123456789abcdef" };

describe("behavior prefab identity", () => {
  it("duplicates the active object with fresh self-references and unchanged external targets", () => {
    const original = { ...object("root"), behaviors: component() };
    original.behaviors = { ...original.behaviors, entries: [{ ...original.behaviors.entries[0],
      values: { self: { entityId: "root" }, external: { entityId: "child" } },
    }] };
    const result = duplicateActiveSceneObject([original, object("child")], "root", () => "clone");
    const clone = result.objects[2];
    expect(clone.behaviors?.entries[0].values).toEqual({ self: { entityId: "clone" }, external: { entityId: "child" } });
    expect(clone.behaviors).not.toBe(original.behaviors);
    expect(clone.behaviors?.entries[0].values).not.toBe(original.behaviors.entries[0].values);
    expect(original.behaviors.entries[0].values.self).toEqual({ entityId: "root" });
  });

  it("duplicates internal entity references while retaining external identity and authored entry ids", () => {
    const objects = [{ ...object("root"), behaviors: component() }, object("child", "root"), object("outside")];
    const duplicated = duplicateObjectSubtrees(objects, ["root"], {
      idSuffix: "copy", rootOffset: 1, remapPrefabInstances: true, createObjectId: (index) => `clone-${index}`,
    });
    const root = duplicated.objects.find((value) => value.id === "clone-0")!;
    expect(root.behaviors?.entries[0]).toMatchObject({ id: "follow", values: { target: { entityId: "clone-1" }, external: { entityId: "outside" } } });
    expect(root.behaviors).not.toBe(objects[0].behaviors);
    expect(objects[0].behaviors?.entries[0].values.target).toEqual({ entityId: "child" });
  });

  it("remaps saved prefab references for each independent instance and following source updates", () => {
    const source = prefab(), first = instantiatePrefabDocument(source, { asset }), second = instantiatePrefabDocument(source, { asset });
    expect(first[0].behaviors?.entries[0].values.target).toEqual({ entityId: first[1].id });
    expect(second[0].behaviors?.entries[0].values.target).toEqual({ entityId: second[1].id });
    expect(first[1].id).not.toBe(second[1].id);
    const modified = { ...source, objects: source.objects.map((entry) => entry.id === "root"
      ? { ...entry, behaviors: { ...component(), entries: [{ ...component().entries[0], values: { target: { entityId: "child" }, speed: 8 } }] } }
      : entry) };
    const updated = updatePrefabLinkedInstances([...first, ...second], modified, asset);
    expect(updated[0].behaviors?.entries[0].values).toEqual({ target: { entityId: first[1].id }, speed: 8 });
    expect(updated[2].behaviors?.entries[0].values).toEqual({ target: { entityId: second[1].id }, speed: 8 });
  });

  it("treats behavior edits and removal as component overrides without touching the prefab source", () => {
    const source = prefab(), first = instantiatePrefabDocument(source, { asset }), second = instantiatePrefabDocument(source, { asset });
    const edited = applyScenePatch(first[0], { behaviors: { version: 1, entries: [{
      ...first[0].behaviors!.entries[0], values: { target: { entityId: first[1].id }, speed: 7 },
    }] } });
    const removed = applyScenePatch(second[0], { behaviors: undefined });
    expect(edited.prefabLink?.overrides).toContain("components");
    const updated = updatePrefabLinkedInstances([edited, first[1], removed, second[1]], source, asset);
    expect(updated[0].behaviors?.entries[0].values.speed).toBe(7);
    expect(updated[0].behaviors?.entries[0].values.target).toEqual({ entityId: first[1].id });
    expect(updated[2].behaviors).toBeUndefined();
    expect(source.objects[0].behaviors?.entries[0].values.speed).toBe(2);
  });
});
