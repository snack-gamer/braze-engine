import { describe, expect, it } from "vitest";
import { createSceneDocumentPatch, sceneDocumentHasAuthoredChanges } from "./scene-delta";
import { SCENE_DOCUMENT_VERSION, type SceneDocumentV1 } from "./scene-document";

const document = (objects: unknown[], savedAt = "first"): SceneDocumentV1 => ({
  version: SCENE_DOCUMENT_VERSION,
  savedAt,
  objects,
});

describe("createSceneDocumentPatch", () => {
  it("emits changed objects and metadata without resending unchanged objects", () => {
    const unchanged = { id: "a", value: 1 };
    const patch = createSceneDocumentPatch(
      document([unchanged, { id: "b", value: 1 }]),
      document([unchanged, { id: "b", value: 2 }], "second"),
    );
    expect(patch).toEqual({
      metadata: { savedAt: "second" },
      upsertObjects: [{ id: "b", value: 2 }],
    });
  });

  it("encodes removals and ordering only when they change", () => {
    const patch = createSceneDocumentPatch(
      document([{ id: "a" }, { id: "b" }]),
      document([{ id: "c" }, { id: "b" }]),
    );
    expect(patch).toMatchObject({
      upsertObjects: [{ id: "c" }],
      removeObjectIds: ["a"],
      objectOrder: ["c", "b"],
    });
  });

  it("returns null for identical or unsafe documents", () => {
    const same = document([{ id: "a" }]);
    expect(createSceneDocumentPatch(same, same)).toBeNull();
    expect(createSceneDocumentPatch(same, document([{ value: 1 }]))).toBeNull();
  });

  it("does not treat a write timestamp as authored scene work", () => {
    const previous = document([{ id: "one", value: 1 }]);
    const timestampOnly = { ...previous, savedAt: "later" };
    expect(sceneDocumentHasAuthoredChanges(previous, timestampOnly)).toBe(false);
    expect(sceneDocumentHasAuthoredChanges(previous, {
      ...timestampOnly,
      activeObjectId: "one",
    })).toBe(true);
  });
});
