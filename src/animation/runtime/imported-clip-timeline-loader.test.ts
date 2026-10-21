import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { AssetSubAsset, LibraryAsset } from "../../lib/asset-api";
import type { AssetCache, LoadedAsset } from "../../three/assets";
import type { PrimitiveKind } from "../../types";
import { ImportedClipTimelineLoader } from "./imported-clip-timeline-loader";

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}>;

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function asset(): LibraryAsset {
  return {
    guid: "a".repeat(32),
    name: "Character",
    filename: "characters/hero.fbx",
    path: "assets/characters/hero.fbx",
    url: "/3d-models/characters/hero.fbx",
    contentRevision: "catalog-r1",
    sizeBytes: 1,
  };
}

function clipSubAsset(overrides: Partial<AssetSubAsset> = {}): AssetSubAsset {
  return {
    localId: "clip:Run",
    kind: "clip",
    name: "Run",
    sourceIndex: 0,
    runtimeClipIndex: 1,
    frameRate: 60,
    ...overrides,
  };
}

function loadedAsset(animations: THREE.AnimationClip[]): LoadedAsset {
  return { object: new THREE.Group(), animations };
}

function cacheHarness(loads: readonly Promise<LoadedAsset>[]) {
  let requestIndex = 0;
  const releases: ReturnType<typeof vi.fn>[] = [];
  const acquire = vi.fn((_assetUrl: string, _primitive: PrimitiveKind) => {
    const release = vi.fn();
    releases.push(release);
    const value = loads[requestIndex];
    requestIndex += 1;
    if (!value) throw new Error("Missing test asset load");
    return { value, release };
  });
  const dispose = vi.fn();
  const cache: AssetCache = { acquire, dispose };
  return { cache, acquire, dispose, releases };
}

function runtimeClips(): THREE.AnimationClip[] {
  return [
    new THREE.AnimationClip("Source", 2, [
      new THREE.VectorKeyframeTrack("Root.position", [0, 2], [0, 0, 0, 1, 0, 0]),
    ]),
    new THREE.AnimationClip("Run", 1, [
      new THREE.QuaternionKeyframeTrack(
        ".bones[Hips].quaternion",
        [0, 0.5, 1],
        [0, 0, 0, 1, 0, 0.5, 0, 0.866, 0, 0, 0, 1],
      ),
    ]),
  ];
}

describe("imported Clip timeline loader", () => {
  it("loads the versioned model, selects runtimeClipIndex, and releases after copying", async () => {
    const harness = cacheHarness([Promise.resolve(loadedAsset(runtimeClips()))]);
    const loader = new ImportedClipTimelineLoader(harness.cache);

    const result = await loader.load({
      asset: asset(),
      subAsset: clipSubAsset(),
      importVersion: "import-r7",
    });

    expect(harness.acquire).toHaveBeenCalledWith(
      "/3d-models/characters/hero.fbx?importVersion=import-r7",
      "fbx",
    );
    expect(result).toMatchObject({ clipName: "Run", durationSeconds: 1, frameRate: 60 });
    expect(result?.rows[0]).toMatchObject({
      targetLabel: "Hips",
      propertyLabel: "Rotation",
      keyTimesSeconds: [0, 0.5, 1],
      keyframeCount: 3,
    });
    expect(harness.releases[0]).toHaveBeenCalledOnce();
    loader.dispose();
    expect(harness.dispose).toHaveBeenCalledOnce();
  });

  it("falls back to sourceIndex when an importer has no runtime index", async () => {
    const harness = cacheHarness([Promise.resolve(loadedAsset(runtimeClips()))]);
    const loader = new ImportedClipTimelineLoader(harness.cache);

    const result = await loader.load({
      asset: asset(),
      subAsset: clipSubAsset({ runtimeClipIndex: undefined, sourceIndex: 0 }),
    });

    expect(result?.clipName).toBe("Run");
    expect(result?.durationSeconds).toBe(2);
    expect(harness.acquire.mock.calls[0]?.[0]).toContain("importVersion=catalog-r1");
    expect(harness.releases[0]).toHaveBeenCalledOnce();
    loader.dispose();
  });

  it("releases a failed asset lease", async () => {
    const failed = Promise.reject<LoadedAsset>(new Error("network unavailable"));
    const harness = cacheHarness([failed]);
    const loader = new ImportedClipTimelineLoader(harness.cache);

    await expect(loader.load({ asset: asset(), subAsset: clipSubAsset() }))
      .rejects.toThrow("network unavailable");
    expect(harness.releases[0]).toHaveBeenCalledOnce();
    loader.dispose();
  });

  it("drops stale completions and releases every superseded lease", async () => {
    const first = deferred<LoadedAsset>();
    const second = deferred<LoadedAsset>();
    const harness = cacheHarness([first.promise, second.promise]);
    const loader = new ImportedClipTimelineLoader(harness.cache);
    const firstResult = loader.load({ asset: asset(), subAsset: clipSubAsset() });
    const secondResult = loader.load({
      asset: asset(),
      subAsset: clipSubAsset({ name: "Source", runtimeClipIndex: 0 }),
      importVersion: "import-r2",
    });

    second.resolve(loadedAsset(runtimeClips()));
    expect((await secondResult)?.clipName).toBe("Source");
    first.resolve(loadedAsset(runtimeClips()));
    expect(await firstResult).toBeNull();
    expect(harness.releases[0]).toHaveBeenCalledOnce();
    expect(harness.releases[1]).toHaveBeenCalledOnce();
    loader.dispose();
  });

  it("disposes the cache and releases a load that settles after teardown", async () => {
    const pending = deferred<LoadedAsset>();
    const harness = cacheHarness([pending.promise]);
    const loader = new ImportedClipTimelineLoader(harness.cache);
    const result = loader.load({ asset: asset(), subAsset: clipSubAsset() });

    loader.dispose();
    pending.resolve(loadedAsset(runtimeClips()));

    expect(await result).toBeNull();
    expect(harness.dispose).toHaveBeenCalledOnce();
    expect(harness.releases[0]).toHaveBeenCalledOnce();
  });
});
