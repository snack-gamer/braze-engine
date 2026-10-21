import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PrefabSaveConflictError,
  fetchPrefabAssetDocument,
  updatePrefabAsset,
} from "./asset-api";

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("prefab asset revisions", () => {
  it("loads the exact document revision through a no-store request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      status: "ok",
      prefab: { version: "braze/prefab-v1", objects: [{ id: "root" }] },
      revision: "prefab-r1",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const loaded = await fetchPrefabAssetDocument("Props/Crate.braze-prefab.json");

    expect(loaded.revision).toBe("prefab-r1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets/prefab?filename=Props%2FCrate.braze-prefab.json",
      { cache: "no-store" },
    );
  });

  it("sends the loaded revision and advances it after save", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      status: "ok",
      asset: {
        filename: "Crate.braze-prefab.json",
        name: "Crate",
        path: "assets/Crate.braze-prefab.json",
        url: "/3d-models/Crate.braze-prefab.json",
        sizeBytes: 10,
      },
      revision: "prefab-r2",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updatePrefabAsset(
      "Crate.braze-prefab.json",
      "Crate",
      { version: "braze/prefab-v1", objects: [{ id: "root" }] },
      "prefab-r1",
    );

    expect(result.revision).toBe("prefab-r2");
    expect(result.asset.contentRevision).toBe("prefab-r2");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)))
      .toMatchObject({ baseRevision: "prefab-r1" });
  });

  it("raises an actionable typed conflict without adopting the remote revision", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      status: "conflict",
      actualRevision: "remote-r2",
    }, 409)));

    await expect(updatePrefabAsset(
      "Crate.braze-prefab.json",
      "Crate",
      { version: "braze/prefab-v1", objects: [{ id: "root" }] },
      "local-r1",
    )).rejects.toMatchObject({
      name: PrefabSaveConflictError.name,
      actualRevision: "remote-r2",
      message: expect.stringContaining("close and reopen"),
    });
  });
});
