import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "../../lib/api";
import {
  beginAssetLibraryRefresh,
  completeAssetLibraryRefresh,
  createAssetLibraryRefreshState,
  failAssetLibraryRefresh,
} from "./asset-library-refresh-state";

describe("asset library refresh state", () => {
  it("is not ready while the latest refresh is pending", () => {
    const ready = completeAssetLibraryRefresh(
      beginAssetLibraryRefresh(createAssetLibraryRefreshState(), 1),
      1,
      [asset("old")],
    );

    const pending = beginAssetLibraryRefresh(ready, 2);

    expect(pending.phase).toBe("pending");
    expect(pending.loaded).toBe(true);
    expect(pending.assets).toEqual([asset("old")]);
  });

  it("ignores an older refresh that resolves after a newer request starts", () => {
    let state = beginAssetLibraryRefresh(createAssetLibraryRefreshState(), 1);
    state = beginAssetLibraryRefresh(state, 2);

    const staleCompletion = completeAssetLibraryRefresh(state, 1, [asset("stale")]);
    const currentCompletion = completeAssetLibraryRefresh(staleCompletion, 2, [asset("current")]);

    expect(staleCompletion).toBe(state);
    expect(currentCompletion.phase).toBe("ready");
    expect(currentCompletion.assets).toEqual([asset("current")]);
  });

  it("keeps the catalog unready when the latest refresh fails", () => {
    let state = beginAssetLibraryRefresh(createAssetLibraryRefreshState(), 1);
    state = completeAssetLibraryRefresh(state, 1, [asset("last-known")]);
    state = beginAssetLibraryRefresh(state, 2);

    const failed = failAssetLibraryRefresh(state, 2, "refresh failed");
    const staleSuccess = completeAssetLibraryRefresh(failed, 1, [asset("stale")]);

    expect(failed.phase).toBe("error");
    expect(failed.error).toBe("refresh failed");
    expect(failed.assets).toEqual([asset("last-known")]);
    expect(staleSuccess).toBe(failed);
  });
});

function asset(filename: string): LibraryAsset {
  return {
    filename,
    name: filename,
    kind: "model",
    path: filename,
    sizeBytes: 1,
    url: `/assets/${filename}`,
  };
}
