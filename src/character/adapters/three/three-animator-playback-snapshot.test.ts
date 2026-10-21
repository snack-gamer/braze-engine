import { describe, expect, it, vi } from "vitest";
import { createDefaultAnimatorComponent } from "../../domain/animator-component";
import { createAnimatorController } from "../../domain/animator-controller";
import type { SceneObject } from "../../../scene/domain/scene-object";
import type { LibraryAsset } from "../../../lib/asset-api";
import type { ThreeAnimatorPlaybackCatalog } from "./three-animator-playback-resolver";
import {
  snapshotThreeAnimatorPlaybackCatalog,
  ThreeAnimatorPlaybackSnapshotLatch,
} from "./three-animator-playback-snapshot";

describe("Three Animator Play catalog snapshot", () => {
  it("waits for readiness, captures once, and ignores later catalog refreshes", () => {
    const capture = vi.fn(snapshotThreeAnimatorPlaybackCatalog);
    const latch = new ThreeAnimatorPlaybackSnapshotLatch(capture);
    const initial = catalog("Initial");
    const ready = catalog("Ready");
    const refreshed = catalog("Refreshed");
    const playObjects = objects();

    expect(latch.resolve("playing", false, initial, playObjects)).toBeNull();
    expect(latch.resolve("playing", false, ready, playObjects)).toBeNull();

    const snapshot = latch.resolve("playing", true, ready, playObjects);
    expect(snapshot?.importedAssets[0]?.name).toBe("Ready");
    expect(capture).toHaveBeenCalledOnce();

    expect(latch.resolve("playing", true, refreshed, playObjects)).toBe(snapshot);
    expect(latch.resolve("playing", false, refreshed, playObjects)).toBe(snapshot);
    expect(capture).toHaveBeenCalledOnce();
  });

  it("reuses the snapshot across viewport replacement and resets only at Edit", () => {
    const capture = vi.fn(snapshotThreeAnimatorPlaybackCatalog);
    const latch = new ThreeAnimatorPlaybackSnapshotLatch(capture);
    const first = catalog("First Play");
    const changedDuringPlay = catalog("Changed During Play");
    const second = catalog("Second Play");
    const playObjects = objects();

    const playSnapshot = latch.resolve("playing", true, first, playObjects);
    expect(latch.resolve("paused", true, changedDuringPlay, playObjects)).toBe(playSnapshot);
    expect(capture).toHaveBeenCalledOnce();

    expect(latch.resolve("edit", true, changedDuringPlay, playObjects)).toBeNull();
    const nextPlaySnapshot = latch.resolve("playing", true, second, playObjects);
    expect(nextPlaySnapshot).not.toBe(playSnapshot);
    expect(nextPlaySnapshot?.importedAssets[0]?.name).toBe("Second Play");
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("freezes enabled scene objects when Play begins even if catalog readiness is delayed", () => {
    const latch = new ThreeAnimatorPlaybackSnapshotLatch();
    const playObjects = objects();
    const base = catalog("Target A");
    const source: ThreeAnimatorPlaybackCatalog = {
      ...base,
      importedAssets: [...base.importedAssets, catalogAsset("b".repeat(32), "Target B")],
    };

    expect(latch.resolve("playing", false, source, playObjects)).toBeNull();
    playObjects[0]!.assetRef = { guid: "b".repeat(32), localId: "main" };

    const snapshot = latch.resolve("playing", true, source, playObjects);

    expect(snapshot?.importedAssets.map((asset) => asset.guid)).toEqual(["a".repeat(32)]);
    expect(latch.playableObjects()[0]?.assetRef?.guid).toBe("a".repeat(32));
    expect(latch.playableObjects()[0]).not.toBe(playObjects[0]);
  });

  it("deeply isolates the running snapshot from mutable publication data", () => {
    const source = catalog("Original");
    const snapshot = snapshotThreeAnimatorPlaybackCatalog(source, objects());

    source.importedAssets[0]!.name = "Mutated";
    (source.library.extensions as Record<string, unknown>).runtime = { changed: true };

    expect(snapshot.importedAssets[0]?.name).toBe("Original");
    expect(snapshot.library.extensions).toEqual({});
  });

  it("retains only reachable Controllers, Masks, models, and copied-Avatar metadata", () => {
    const controllerId = "d".repeat(32);
    const unusedControllerId = "e".repeat(32);
    const maskId = "f".repeat(32);
    const target = catalogAsset("a".repeat(32), "Target");
    target.subAssets = [{
      localId: "avatar:main",
      kind: "avatar",
      name: "Target Avatar",
      configuredAvatarRef: { guid: "b".repeat(32), localId: "avatar:main" },
    }];
    const usedController = {
      ...createAnimatorController(controllerId, "Used"),
      revision: "used-r1",
    };
    usedController.layers[0]!.avatarMaskRef = { guid: maskId, localId: "main" };
    const playObjects = objects();
    playObjects[0]!.animator = {
      ...createDefaultAnimatorComponent(),
      controllerRef: { guid: controllerId, localId: "main" },
    };
    const source: ThreeAnimatorPlaybackCatalog = {
      library: {
        version: 1,
        animatorControllers: [
          usedController,
          { ...createAnimatorController(unusedControllerId, "Unused"), revision: "unused-r1" },
        ],
        avatarMasks: [
          {
            version: 1,
            id: maskId,
            revision: "mask-r1",
            name: "Used Mask",
            humanoidBodyParts: {},
            transforms: [],
          },
          {
            version: 1,
            id: "0".repeat(32),
            revision: "unused-mask-r1",
            name: "Unused Mask",
            humanoidBodyParts: {},
            transforms: [],
          },
        ],
        extensions: { editorOnly: true },
      },
      importedAssets: [
        target,
        catalogAsset("b".repeat(32), "Copied Avatar Source"),
        catalogAsset("c".repeat(32), "Unrelated"),
      ],
    };

    const snapshot = snapshotThreeAnimatorPlaybackCatalog(source, playObjects);

    expect(snapshot.library.animatorControllers.map((asset) => asset.id)).toEqual([controllerId]);
    expect(snapshot.library.avatarMasks.map((asset) => asset.id)).toEqual([maskId]);
    expect(snapshot.library.extensions).toEqual({});
    expect(snapshot.importedAssets.map((asset) => asset.guid)).toEqual([
      "a".repeat(32),
      "b".repeat(32),
    ]);
  });
});

function catalog(name: string): ThreeAnimatorPlaybackCatalog {
  return {
    library: {
      version: 1,
      animatorControllers: [],
      avatarMasks: [],
      extensions: {},
    },
    importedAssets: [catalogAsset("a".repeat(32), name)],
  };
}

function catalogAsset(guid: string, name: string): LibraryAsset {
  return {
    guid,
    name,
    filename: `${name}.glb`,
    kind: "model" as const,
    path: `assets/${name}.glb`,
    url: `/3d-models/${name}.glb`,
    sizeBytes: 1,
  };
}

function objects(): SceneObject[] {
  return [{
    id: "character",
    name: "Character",
    primitive: "gltf",
    color: "#ffffff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    assetRef: { guid: "a".repeat(32), localId: "main" },
    animator: createDefaultAnimatorComponent(),
  }];
}
