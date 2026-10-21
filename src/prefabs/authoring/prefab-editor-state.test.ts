import { describe, expect, it } from "vitest";
import { PrefabSaveConflictError } from "../../lib/asset-api";
import { makeObject } from "../../lib/payload";
import { PREFAB_DOCUMENT_VERSION } from "../../lib/prefabs";
import {
  createPrefabEditorState,
  beginPrefabSave,
  completePrefabSave,
  failPrefabSave,
  redoPrefabEditorState,
  undoPrefabEditorState,
  updatePrefabEditorObjects,
} from "./prefab-editor-state";

const asset = {
  filename: "crate.braze-prefab.json",
  name: "Crate",
  url: "/assets/crate.braze-prefab.json",
  path: "crate.braze-prefab.json",
  kind: "prefab" as const,
  sizeBytes: 10,
};

function document() {
  return {
    version: PREFAB_DOCUMENT_VERSION,
    name: "Crate",
    createdAt: "2026-01-01T00:00:00.000Z",
    rootIds: [],
    objects: [makeObject("cube", 1)],
  };
}

describe("prefab editor state", () => {
  it("records one document boundary and supports undo/redo", () => {
    const initial = createPrefabEditorState(asset, document());
    const selected = initial.doc.objects.find((object) => object.primitive === "cube")!;
    const edited = updatePrefabEditorObjects(
      initial,
      (objects) => objects.map((object) => object.id === selected.id ? { ...object, name: "Edited" } : object),
      selected.id,
    );

    expect(edited.past).toHaveLength(1);
    expect(edited.doc.objects.find((object) => object.id === selected.id)?.name).toBe("Edited");
    expect(undoPrefabEditorState(edited).doc.objects.find((object) => object.id === selected.id)?.name).toBe(selected.name);
    expect(redoPrefabEditorState(undoPrefabEditorState(edited)).doc.objects.find((object) => object.id === selected.id)?.name).toBe("Edited");
  });

  it("keeps unchanged asset reconciliation clean, including during Save", () => {
    const initial = createPrefabEditorState(asset, document());
    expect(updatePrefabEditorObjects(initial, (objects) => objects)).toBe(initial);
    const saving = beginPrefabSave(initial);
    expect(updatePrefabEditorObjects(saving, (objects) => objects)).toBe(saving);
    const selectedId = initial.doc.objects.find((object) => object.primitive === "cube")!.id;
    const selected = updatePrefabEditorObjects(initial, (objects) => objects, selectedId);
    expect(selected.selectedId).toBe(selectedId); expect(selected.dirty).toBe(false);
    expect(selected.past).toEqual([]); expect(selected.doc).toBe(initial.doc);
  });

  it("protects the normalized master root when selection disappears", () => {
    const initial = createPrefabEditorState(asset, document());
    const selected = initial.doc.objects.find((object) => object.primitive === "cube")!;
    const edited = updatePrefabEditorObjects(initial, (objects) => objects.filter((object) => object.id !== selected.id));

    expect(edited.selectedId).toBe(edited.doc.rootIds[0]);
    expect(edited.doc.objects[0].primitive).toBe("transform");
  });

  it("advances the persisted revision without clearing edits made during save", () => {
    const initial = createPrefabEditorState(asset, document(), "prefab-r1");
    const pending = updatePrefabEditorObjects(initial, (objects) => objects.map((object) => ({
      ...object,
      name: object.primitive === "cube" ? "First edit" : object.name,
    })));
    const saving = beginPrefabSave(pending);
    const newer = updatePrefabEditorObjects(saving, (objects) => objects.map((object) => ({
      ...object,
      name: object.primitive === "cube" ? "Newer edit" : object.name,
    })));
    const completed = completePrefabSave(newer, pending, asset, pending.doc, "prefab-r2");

    expect(completed.revision).toBe("prefab-r2");
    expect(completed.asset.contentRevision).toBe("prefab-r2");
    expect(completed.dirty).toBe(true);
    expect(completed.doc.objects.find((object) => object.primitive === "cube")?.name)
      .toBe("Newer edit");
  });

  it("retains dirty edits and the loaded base after a save conflict", () => {
    const initial = createPrefabEditorState(asset, document(), "prefab-r1");
    const pending = updatePrefabEditorObjects(initial, (objects) => objects.map((object) => ({
      ...object,
      name: object.primitive === "cube" ? "Unsaved edit" : object.name,
    })));
    const failed = failPrefabSave(
      beginPrefabSave(pending),
      pending,
      new PrefabSaveConflictError("remote-r2"),
    );

    expect(failed.dirty).toBe(true);
    expect(failed.saving).toBe(false);
    expect(failed.revision).toBe("prefab-r1");
    expect(failed.error).toContain("close and reopen");
  });
});
