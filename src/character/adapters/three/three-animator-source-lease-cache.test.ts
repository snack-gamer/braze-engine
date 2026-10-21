import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { LibraryAsset, ModelImportDocument } from "../../../lib/asset-api";
import { defaultModelImportSettings } from "../../../lib/model-import-settings";
import type { Runtime } from "../../../three/runtime";
import { characterRuntimeSuccess } from "../../runtime/diagnostics";
import { ThreeAnimatorSourceLeaseCache } from "./three-animator-source-lease-cache";

function model(index: number): LibraryAsset {
  return {
    guid: index.toString(16).padStart(32, "0"),
    name: `Source ${index}`,
    filename: `source-${index}.fbx`,
    path: `assets/source-${index}.fbx`,
    url: `/3d-models/source-${index}.fbx`,
    sizeBytes: 1,
  };
}

function importDocument(asset: LibraryAsset): ModelImportDocument {
  return {
    version: "1",
    sourceFilename: asset.filename,
    settings: defaultModelImportSettings,
    revision: `${asset.filename}-meta-r1`,
    updatedAt: null,
    importVersion: `${asset.filename}-import-r1`,
  };
}

function harness() {
  const releases: ReturnType<typeof vi.fn>[] = [];
  const acquire = vi.fn(() => {
    const release = vi.fn();
    releases.push(release);
    return {
      value: Promise.resolve({ object: new THREE.Group(), animations: [] }),
      release,
    };
  });
  const runtime = {
    disposed: false,
    assetCache: { acquire, dispose: vi.fn() },
  } as Pick<Runtime, "assetCache" | "disposed">;
  return { runtime, acquire, releases };
}

describe("Three Animator source lease cache", () => {
  it("keeps only the most recent external model leases resident", async () => {
    const { runtime, acquire, releases } = harness();
    const cache = new ThreeAnimatorSourceLeaseCache(runtime, 2);

    for (let index = 1; index <= 3; index += 1) {
      const asset = model(index);
      const lease = cache.acquire(
        asset,
        Promise.resolve(characterRuntimeSuccess(importDocument(asset))),
      );
      expect((await lease.value).value).not.toBeNull();
      lease.release();
    }

    expect(acquire).toHaveBeenCalledTimes(3);
    expect(releases[0]).toHaveBeenCalledOnce();
    expect(releases[1]).not.toHaveBeenCalled();
    expect(releases[2]).not.toHaveBeenCalled();

    cache.dispose();
    cache.dispose();
    expect(releases[0]).toHaveBeenCalledOnce();
    expect(releases[1]).toHaveBeenCalledOnce();
    expect(releases[2]).toHaveBeenCalledOnce();
  });

  it("never evicts a source while a resolver still pins it", async () => {
    const { runtime, releases } = harness();
    const cache = new ThreeAnimatorSourceLeaseCache(runtime, 1);
    const firstAsset = model(1);
    const secondAsset = model(2);
    const first = cache.acquire(
      firstAsset,
      Promise.resolve(characterRuntimeSuccess(importDocument(firstAsset))),
    );
    const second = cache.acquire(
      secondAsset,
      Promise.resolve(characterRuntimeSuccess(importDocument(secondAsset))),
    );
    await Promise.all([first.value, second.value]);

    second.release();
    expect(releases[0]).not.toHaveBeenCalled();
    expect(releases[1]).toHaveBeenCalledOnce();
    first.release();
    cache.dispose();
    expect(releases[0]).toHaveBeenCalledOnce();
  });

  it("rejects acquisitions after disposal without touching the asset cache", async () => {
    const { runtime, acquire } = harness();
    const cache = new ThreeAnimatorSourceLeaseCache(runtime, 2);
    const asset = model(1);
    cache.dispose();

    const lease = cache.acquire(
      asset,
      Promise.resolve(characterRuntimeSuccess(importDocument(asset))),
    );

    expect((await lease.value).diagnostics[0]?.code).toBe("disposed-animator-asset-resolver");
    expect(acquire).not.toHaveBeenCalled();
  });
});
