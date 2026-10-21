import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SceneSaveConflictError,
  canKeepaliveSceneSave,
  fetchSavedSceneDocument,
  saveScene,
  saveSceneIncrementally,
  tryKeepaliveSceneSave,
} from "./scene-api";
import { SCENE_DOCUMENT_VERSION, type SceneDocumentV1 } from "../scene/serialization/scene-document";

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("scene API revisions", () => {
  it("targets the owning scene during keepalive teardown instead of overwriting current", () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: "ok" })); vi.stubGlobal("fetch", fetchMock);
    expect(tryKeepaliveSceneSave({ objects: [] }, "scene-b-revision", "scene-b")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/scenes/scene-b", expect.objectContaining({ keepalive: true, method: "PUT" }));
  });
  it("accepts keepalive saves at the transport limit and rejects one byte more", () => {
    const keepaliveLimit = 60 * 1024;
    const scene = { objects: [{ value: "" }] };
    const fixedBytes = new Blob([JSON.stringify({ scene, baseRevision: null })]).size;
    const atLimit = {
      objects: [{ value: "x".repeat(keepaliveLimit - fixedBytes) }],
    };

    expect(canKeepaliveSceneSave(atLimit, null)).toBe(true);
    expect(canKeepaliveSceneSave({
      objects: [{ value: `${atLimit.objects[0].value}x` }],
    }, null)).toBe(false);
  });

  it("loads and saves using the server revision", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: "ok", scene: { version: "v1", objects: [] }, revision: "r1" }))
      .mockResolvedValueOnce(jsonResponse({ status: "ok", savedAt: "now", revision: "r2" }));
    vi.stubGlobal("fetch", fetchMock);

    const loaded = await fetchSavedSceneDocument();
    const saved = await saveScene(loaded.scene!, loaded.revision);
    expect(saved).toEqual({ revision: "r2", savedAt: "now" });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ baseRevision: "r1" });
  });

  it("raises a typed conflict with the latest server revision", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      status: "conflict",
      message: "changed elsewhere",
      actualRevision: "remote-r2",
    }, 409)));

    await expect(saveScene({ version: "v1", objects: [] }, "local-r1")).rejects.toMatchObject({
      name: SceneSaveConflictError.name,
      actualRevision: "remote-r2",
    });
  });

  it("uses a compact PATCH when only one object changed", async () => {
    const previous: SceneDocumentV1 = {
      version: SCENE_DOCUMENT_VERSION,
      savedAt: "first",
      objects: [{ id: "a", value: "unchanged".repeat(100) }, { id: "b", value: 1 }],
    };
    const next: SceneDocumentV1 = {
      ...previous,
      savedAt: "second",
      objects: [previous.objects[0], { id: "b", value: 2 }],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      status: "ok",
      savedAt: "second",
      revision: "r2",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await saveSceneIncrementally(next, previous, "r1");

    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PATCH");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      baseRevision: "r1",
      patch: {
        metadata: { savedAt: "second" },
        upsertObjects: [{ id: "b", value: 2 }],
      },
    });
  });
});
