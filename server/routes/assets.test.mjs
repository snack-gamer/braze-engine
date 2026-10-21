import assert from "node:assert/strict";
import test from "node:test";
import { effectiveAssetContentRevision } from "../lib/assets/asset-content-revision.mjs";
import { enrichLibraryAsset } from "./assets.mjs";

test("asset list records expose generated import analysis", () => {
  const asset = {
    filename: "Models/Shop.gltf",
    name: "Shop.gltf",
    kind: "model",
    path: "assets/Models/Shop.gltf",
    url: "/3d-models/Models/Shop.gltf",
    sizeBytes: 42,
  };
  const record = {
    guid: "0123456789abcdef0123456789abcdef",
    importerId: "braze.model",
    status: "dirty",
    sourceHash: "content-revision-1",
    foreignIds: { unityGuid: "unity-shop" },
    dependencies: [
      { kind: "texture", path: "textures/atlas.png" },
      {
        kind: "asset",
        guid: "fedcba9876543210fedcba9876543210",
        localId: "main",
        objectId: "door",
        relationship: "nested-prefab",
      },
    ],
    subAssets: [{ localId: "mesh:body", kind: "mesh", name: "Body", sourceIndex: 0 }],
    diagnostics: [{ code: "missing-texture", severity: "warning", message: "Texture is missing" }],
  };

  const { sourceHash, ...publicRecord } = record;
  assert.deepEqual(enrichLibraryAsset(asset, record), {
    ...asset,
    ...publicRecord,
    contentRevision: effectiveAssetContentRevision(record),
  });
  assert.notEqual(enrichLibraryAsset(asset, record).contentRevision, sourceHash);
});
