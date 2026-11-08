import { afterEach, expect, it, vi } from "vitest";
import { deleteSavedScene, saveScene, saveSceneIncrementally } from "../../lib/scene-api";
import { savePrefabAsset, updatePrefabAsset } from "../../lib/asset-api";
import { SCENE_DOCUMENT_VERSION, type SceneDocumentV1 } from "../../scene/serialization/scene-document";
import { subscribeAuthoredDocumentSaved } from "./authored-document-events";

afterEach(() => vi.unstubAllGlobals());
it("invalidates saved projections only after successful scene, prefab and deletion writes", async () => {
  const observed = vi.fn(), unsubscribe = subscribeAuthoredDocumentSaved(observed);
  let success = true;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(success
    ? { status: "ok", revision: "r2", trashId: "trash", asset: { filename: "test.prefab" } }
    : { status: "error", message: "conflict" }), { status: success ? 200 : 409 })));
  try {
    await saveScene({ objects: [] }, "r1");
    expect(observed).toHaveBeenCalledTimes(1);
    const previous = { version: SCENE_DOCUMENT_VERSION, objects: [{ id: "x", name: "Large", data: "x".repeat(500) }] } as unknown as SceneDocumentV1;
    const next = { ...previous, name: "Renamed" };
    await saveSceneIncrementally(next, previous, "r1");
    await savePrefabAsset("Test", {});
    await updatePrefabAsset("test.prefab", "Test", {}, "r1");
    await deleteSavedScene("other", "r1");
    expect(observed).toHaveBeenCalledTimes(5);
    success = false;
    await expect(saveScene({ objects: [] }, "r1")).rejects.toThrow();
    expect(observed).toHaveBeenCalledTimes(5);
    unsubscribe(); success = true;
    await saveScene({ objects: [] }, "r1");
    expect(observed).toHaveBeenCalledTimes(5);
  } finally { unsubscribe(); }
});
