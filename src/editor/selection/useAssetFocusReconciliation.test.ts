import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "../../lib/api";
import { reconcileFocusedLibraryAsset } from "./useAssetFocusReconciliation";

const original = asset("Characters/Hero.fbx", "a".repeat(32));

describe("focused asset reconciliation", () => {
  it("follows an externally renamed asset by GUID", () => {
    const renamed = asset("Characters/Detective.fbx", original.guid!);
    expect(reconcileFocusedLibraryAsset({ kind: "model", asset: original }, [renamed]))
      .toEqual({ kind: "model", asset: renamed });
  });

  it("clears an externally deleted asset", () => {
    expect(reconcileFocusedLibraryAsset({ kind: "model", asset: original }, []))
      .toBeNull();
  });

  it("uses the filename for legacy assets without a GUID", () => {
    const legacy = asset("Legacy.glb", undefined);
    const refreshed = { ...legacy, contentRevision: "r2" };
    expect(reconcileFocusedLibraryAsset({ kind: "model", asset: legacy }, [refreshed]))
      .toEqual({ kind: "model", asset: refreshed });
  });

  it("keeps an imported sub-asset focused by its stable local ID", () => {
    const subAsset = { localId: "clip:Idle", kind: "clip", name: "Idle" };
    const source = { ...original, subAssets: [subAsset] };
    const refreshedSubAsset = { ...subAsset, durationSeconds: 2 };
    const refreshed = { ...source, subAssets: [refreshedSubAsset] };
    expect(reconcileFocusedLibraryAsset({ kind: "model", asset: source, localId: subAsset.localId }, [refreshed]))
      .toEqual({ kind: "model", asset: refreshed, localId: subAsset.localId });
  });
});

function asset(filename: string, guid: string | undefined): LibraryAsset {
  return {
    guid,
    filename,
    name: filename,
    kind: "model",
    path: `assets/${filename}`,
    url: `/3d-models/${filename}`,
    sizeBytes: 1,
  };
}
