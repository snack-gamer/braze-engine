import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "../../lib/api";
import type { SceneObject } from "../../types";
import {
  reconcileSceneAssetReferences,
  resolveAssetForSceneInsertion,
  runtimeUrlForLibraryAsset,
} from "./scene-asset-resolution";

function asset(patch: Partial<LibraryAsset> = {}): LibraryAsset {
  return {
    guid: "model-guid",
    name: "Shop.glb",
    filename: "Models/Shop.glb",
    kind: "model",
    status: "ready",
    subAssets: [{ localId: "main", kind: "model", name: "Shop" }],
    path: "assets/Models/Shop.glb",
    url: "/3d-models/Models/Shop.glb",
    sizeBytes: 42,
    contentRevision: "effective-r2",
    ...patch,
  };
}

function object(patch: Partial<SceneObject> = {}): SceneObject {
  return {
    id: "shop",
    name: "Shop",
    primitive: "gltf",
    color: "#fff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    assetName: "Shop.glb",
    assetRef: { guid: "model-guid", localId: "main" },
    assetUrl: "/3d-models/Models/Shop.glb?importVersion=old",
    ...patch,
  };
}

describe("scene asset revision resolution", () => {
  it("derives model runtime URLs from the effective library revision", () => {
    expect(runtimeUrlForLibraryAsset(asset())).toBe(
      "/3d-models/Models/Shop.glb?importVersion=effective-r2",
    );
    expect(runtimeUrlForLibraryAsset(asset({
      kind: "image",
      filename: "Textures/Shop.png",
      url: "/3d-models/Textures/Shop.png",
    }))).toBe("/3d-models/Textures/Shop.png");
  });

  it("uses the indexed revision for scene insertion payloads", () => {
    expect(resolveAssetForSceneInsertion({
      guid: "model-guid",
      name: "Stale name",
      filename: "Models/Shop.glb",
      url: "/3d-models/Models/Shop.glb",
    }, [asset()])).toEqual({
      guid: "model-guid",
      name: "Shop.glb",
      filename: "Models/Shop.glb",
      url: "/3d-models/Models/Shop.glb?importVersion=effective-r2",
      kind: "model",
      status: "ready",
      subAssets: [{ localId: "main", kind: "model", name: "Shop" }],
    });
  });

  it("refreshes AssetRefs to the effective URL and remains stable afterward", () => {
    const first = reconcileSceneAssetReferences([object()], [asset()]);
    expect(first[0].assetUrl).toBe("/3d-models/Models/Shop.glb?importVersion=effective-r2");
    expect(reconcileSceneAssetReferences(first, [asset()])).toBe(first);
  });

  it("keeps an existing import version when an index revision is temporarily unavailable", () => {
    const current = object();
    const resolved = reconcileSceneAssetReferences([current], [asset({ contentRevision: null })]);
    expect(resolved[0]).toBe(current);
  });

  it("marks unresolved durable references missing", () => {
    const resolved = reconcileSceneAssetReferences([object()], []);
    expect(resolved[0]).toMatchObject({ assetMissing: true, assetUrl: undefined });
  });
});
