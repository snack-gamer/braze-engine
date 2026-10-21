import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ASSET_META_SUFFIX,
  classifyAssetSource,
  metaPathForSource,
  scanAssetIndex,
  updateAssetMeta,
} from "./asset-index.mjs";

const GUID_RE = /^[a-f0-9]{32}$/;

function emptyFbxDocument() {
  return Buffer.from(`; FBX 7.4.0 project file
FBXHeaderExtension:  {
\tFBXVersion: 7400
}
Objects:  {
}
Connections:  {
\tC: "OO",0,0
}
`, "utf8");
}

async function withAssets(run) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "braze-asset-index-"));
  const assetsRoot = path.join(temporary, "Assets");
  await mkdir(assetsRoot, { recursive: true });
  try {
    await run(assetsRoot);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function glbDocument(document) {
  const source = Buffer.from(JSON.stringify(document), "utf8");
  const paddedLength = Math.ceil(source.length / 4) * 4;
  const json = Buffer.alloc(paddedLength, 0x20);
  source.copy(json);
  const output = Buffer.alloc(12 + 8 + json.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(json.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  return output;
}

test("initial scan creates a stable adjacent metadata document", async () => {
  await withAssets(async (assetsRoot) => {
    const source = path.join(assetsRoot, "Models", "PatrolCar.fbx");
    await mkdir(path.dirname(source), { recursive: true });
    const sourceDocument = emptyFbxDocument();
    await writeFile(source, sourceDocument);

    const first = await scanAssetIndex(assetsRoot);
    assert.equal(first.records.length, 1);
    const record = first.records[0];
    assert.match(record.guid, GUID_RE);
    assert.equal(record.id, record.guid);
    assert.equal(record.sourcePath, "Models/PatrolCar.fbx");
    assert.equal(record.metaPath, `Models/PatrolCar.fbx${ASSET_META_SUFFIX}`);
    assert.equal(record.displayName, "PatrolCar");
    assert.equal(record.kind, "model");
    assert.equal(record.importerId, "braze.model");
    assert.equal(record.status, "ready");
    assert.equal(record.sourceHash, createHash("sha256").update(sourceDocument).digest("hex"));
    assert.deepEqual(record.dependencies, []);
    assert.deepEqual(record.subAssets, [
      { localId: "main", kind: "model", name: "PatrolCar", sourceIndex: 0 },
    ]);

    const sidecar = JSON.parse(await readFile(metaPathForSource(source), "utf8"));
    assert.equal(sidecar.fileFormatVersion, 1);
    assert.equal(sidecar.guid, record.guid);
    assert.deepEqual(sidecar.importer, { id: "braze.model", settingsVersion: 1, settings: {} });
    assert.deepEqual(sidecar.labels, []);
    assert.deepEqual(sidecar.foreignIds, {});
    assert.equal("sourceHash" in sidecar, false);
    assert.equal("status" in sidecar, false);
    assert.equal("dependencies" in sidecar, false);
    assert.equal("subAssets" in sidecar, false);
    assert.equal("diagnostics" in sidecar, false);

    const second = await scanAssetIndex(assetsRoot);
    assert.equal(second.records[0].guid, record.guid);
  });
});

test("moving a source and its sidecar preserves its GUID", async () => {
  await withAssets(async (assetsRoot) => {
    const source = path.join(assetsRoot, "Car.glb");
    await writeFile(source, "car", "utf8");
    const original = (await scanAssetIndex(assetsRoot)).records[0];

    const destinationDir = path.join(assetsRoot, "Vehicles");
    const destination = path.join(destinationDir, "DetectiveCar.glb");
    await mkdir(destinationDir, { recursive: true });
    await rename(source, destination);
    await rename(metaPathForSource(source), metaPathForSource(destination));

    const moved = await scanAssetIndex(assetsRoot);
    assert.equal(moved.records.length, 1);
    assert.equal(moved.records[0].guid, original.guid);
    assert.equal(moved.records[0].sourcePath, "Vehicles/DetectiveCar.glb");
    assert.equal(moved.records[0].displayName, "DetectiveCar");
  });
});

test("Unity metadata read failures are diagnosed and heal when the bridge becomes readable", async () => {
  await withAssets(async (assetsRoot) => {
    const source = path.join(assetsRoot, "Bridge.fbx");
    const unityMeta = `${source}.meta`;
    await writeFile(source, emptyFbxDocument());
    await mkdir(unityMeta);

    const failed = (await scanAssetIndex(assetsRoot)).records[0];
    assert.equal(failed.status, "failed");
    assert.ok(failed.diagnostics.some((item) => item.code === "unity-meta-read-failed"));

    await rm(unityMeta, { recursive: true, force: true });
    const unityGuid = "0123456789abcdef0123456789abcdef";
    await writeFile(unityMeta, `fileFormatVersion: 2\nguid: ${unityGuid}\n`, "utf8");
    const healed = (await scanAssetIndex(assetsRoot)).records[0];
    assert.equal(healed.status, "ready");
    assert.equal(healed.foreignIds.unityGuid, unityGuid);
    const sidecar = JSON.parse(await readFile(metaPathForSource(source), "utf8"));
    assert.equal(sidecar.foreignIds.unityGuid, unityGuid);
  });
});

test("duplicate GUIDs are diagnosed on the index and every affected asset", async () => {
  await withAssets(async (assetsRoot) => {
    const firstSource = path.join(assetsRoot, "A.glb");
    const secondSource = path.join(assetsRoot, "B.glb");
    await writeFile(firstSource, "a", "utf8");
    await writeFile(secondSource, "b", "utf8");
    const initial = await scanAssetIndex(assetsRoot);
    const duplicatedGuid = initial.records[0].guid;
    const secondMeta = JSON.parse(await readFile(metaPathForSource(secondSource), "utf8"));
    secondMeta.guid = duplicatedGuid;
    await writeFile(metaPathForSource(secondSource), `${JSON.stringify(secondMeta, null, 2)}\n`, "utf8");

    const scanned = await scanAssetIndex(assetsRoot);
    assert.equal(scanned.diagnostics.length, 1);
    assert.equal(scanned.diagnostics[0].code, "duplicate-guid");
    assert.equal(scanned.diagnostics[0].guid, duplicatedGuid);
    assert.deepEqual(scanned.diagnostics[0].sourcePaths, ["A.glb", "B.glb"]);
    for (const record of scanned.records) {
      assert.equal(record.status, "failed");
      assert.ok(record.diagnostics.some((item) => item.code === "duplicate-guid"));
    }
  });
});

test("common source extensions map to the Project asset kinds", () => {
  const cases = [
    ["hero.FBX", "model", "braze.model"],
    ["street.glb", "model", "braze.model"],
    ["albedo.PNG", "texture", "braze.texture"],
    ["normal.ktx2", "texture", "braze.texture"],
    ["shop.tganprefab.json", "prefab", "braze.prefab"],
    ["shop.braze-prefab.json", "prefab", "braze.prefab"],
    ["brick.brazemat.json", "material", "braze.material"],
    ["district.scene.json", "scene", "braze.scene"],
    ["traffic.ogg", "audio", "braze.audio"],
    ["detective.ts", "script", "braze.script"],
    ["case-notes.txt", "generic", "braze.generic"],
  ];
  for (const [filename, kind, importerId] of cases) {
    const classification = classifyAssetSource(filename);
    assert.equal(classification.kind, kind, filename);
    assert.equal(classification.importerId, importerId, filename);
  }
});

test("GLB analysis reports stable model, mesh, material, and clip subassets", async () => {
  await withAssets(async (assetsRoot) => {
    const source = path.join(assetsRoot, "Buildings", "Shop.glb");
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(source, glbDocument({
      asset: { version: "2.0", generator: "Braze test" },
      scenes: [{ nodes: [0] }],
      scene: 0,
      nodes: [{ name: "Shop", mesh: 0 }],
      meshes: [
        {
          name: "Shop Body",
          extras: { brazeLocalId: "mesh:unity-shop:4300000" },
          primitives: [{ attributes: { POSITION: 0 } }],
        },
        { name: "Shop Door", primitives: [{ attributes: { POSITION: 0 } }] },
      ],
      materials: [{ name: "Atlas" }, { name: "Glass" }],
      animations: [{
        name: "Open Door",
        samplers: [{ input: 1, output: 2 }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
      }],
      accessors: [
        { type: "VEC3", componentType: 5126, count: 3 },
        { type: "SCALAR", componentType: 5126, count: 2 },
        { type: "VEC3", componentType: 5126, count: 2 },
      ],
      buffers: [{ byteLength: 0 }],
    }));

    const record = (await scanAssetIndex(assetsRoot)).records[0];
    assert.equal(record.status, "ready");
    assert.deepEqual(record.dependencies, []);
    assert.deepEqual(
      record.subAssets.map(({ localId, kind, name }) => ({ localId, kind, name })),
      [
        { localId: "main", kind: "model", name: "Shop" },
        { localId: "mesh:unity-shop:4300000", kind: "mesh", name: "Shop Body" },
        { localId: "mesh:Shop-Door", kind: "mesh", name: "Shop Door" },
        { localId: "material:Atlas", kind: "material", name: "Atlas" },
        { localId: "material:Glass", kind: "material", name: "Glass" },
        { localId: "clip:Open-Door", kind: "clip", name: "Open Door" },
      ],
    );
  });
});

test("glTF analysis records external source dependencies", async () => {
  await withAssets(async (assetsRoot) => {
    const source = path.join(assetsRoot, "Models", "Shop.gltf");
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(source, JSON.stringify({
      asset: { version: "2.0" },
      buffers: [{ uri: "shop.bin", byteLength: 12 }],
      images: [{ uri: "textures/atlas.png" }, { uri: "data:image/png;base64,AA==" }],
      meshes: [],
    }), "utf8");

    const record = (await scanAssetIndex(assetsRoot)).records[0];
    assert.equal(record.status, "ready");
    assert.deepEqual(record.dependencies, [
      { kind: "buffer", path: "shop.bin" },
      { kind: "texture", path: "textures/atlas.png" },
    ]);
    assert.equal(record.subAssets[0].localId, "main");
  });
});

test("Braze prefab analysis records entity subassets and GUID dependencies", async () => {
  await withAssets(async (assetsRoot) => {
    const source = path.join(assetsRoot, "Buildings", "Shop.braze-prefab.json");
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(source, JSON.stringify({
      version: "braze/prefab-v1",
      name: "Shop",
      rootIds: ["shop-root"],
      objects: [
        {
          id: "shop-root",
          name: "Shop",
          primitive: "transform",
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        {
          id: "shop-model",
          name: "Shop Model",
          primitive: "gltf",
          parentId: "shop-root",
          assetRef: { guid: "0123456789abcdef0123456789abcdef", localId: "main" },
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        {
          id: "sign",
          name: "Sign",
          primitive: "gltf",
          parentId: "shop-root",
          prefabLink: {
            prefabRef: { guid: "fedcba9876543210fedcba9876543210", localId: "main" },
          },
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    }), "utf8");

    const record = (await scanAssetIndex(assetsRoot)).records[0];
    assert.equal(record.status, "ready");
    assert.deepEqual(
      record.subAssets.map(({ localId, kind, name }) => ({ localId, kind, name })),
      [
        { localId: "main", kind: "prefab", name: "Shop" },
        { localId: "entity:shop-root", kind: "entity", name: "Shop" },
        { localId: "entity:shop-model", kind: "entity", name: "Shop Model" },
        { localId: "entity:sign", kind: "entity", name: "Sign" },
      ],
    );
    assert.deepEqual(record.dependencies, [
      {
        kind: "asset",
        guid: "0123456789abcdef0123456789abcdef",
        localId: "main",
        objectId: "shop-model",
        relationship: "source",
      },
      {
        kind: "asset",
        guid: "fedcba9876543210fedcba9876543210",
        localId: "main",
        objectId: "sign",
        relationship: "nested-prefab",
      },
    ]);
  });
});

test("malformed prefab sources fail analysis without losing asset identity", async () => {
  await withAssets(async (assetsRoot) => {
    const source = path.join(assetsRoot, "Broken.braze-prefab.json");
    await writeFile(source, "{ not-json", "utf8");

    const record = (await scanAssetIndex(assetsRoot)).records[0];
    assert.match(record.guid, GUID_RE);
    assert.equal(record.status, "failed");
    assert.equal(record.subAssets.length, 0);
    assert.ok(record.diagnostics.some((item) => item.code === "invalid-prefab"));
  });
});

test("malformed GLB sources fail analysis without losing their asset identity", async () => {
  await withAssets(async (assetsRoot) => {
    const source = path.join(assetsRoot, "Broken.glb");
    await writeFile(source, "not-a-glb", "utf8");

    const record = (await scanAssetIndex(assetsRoot)).records[0];
    assert.match(record.guid, GUID_RE);
    assert.equal(record.status, "failed");
    assert.equal(record.subAssets.length, 0);
    assert.ok(record.diagnostics.some((item) => item.code === "invalid-model"));
  });
});

test("authored sidecar fields and GUID are preserved while transient fields are excluded", async () => {
  await withAssets(async (assetsRoot) => {
    const source = path.join(assetsRoot, "Characters", "Character.glb");
    const guid = "0123456789abcdef0123456789abcdef";
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(source, "character", "utf8");
    await writeFile(
      metaPathForSource(source),
      `${JSON.stringify(
        {
          fileFormatVersion: 1,
          guid,
          importer: {
            id: "custom.character-model",
            settingsVersion: 3,
            settings: { scaleFactor: 0.01, importAnimations: true },
          },
          labels: ["hero", "detective", "hero"],
          foreignIds: { unityGuid: "unity-character-guid", assetStoreId: 12345 },
          sourceHash: "stale-generated-hash",
          status: "stale",
          dependencies: ["old"],
          subAssets: ["old"],
          diagnostics: ["old"],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const scanned = await scanAssetIndex(assetsRoot);
    const record = scanned.records[0];
    assert.equal(record.guid, guid);
    assert.equal(record.importerId, "custom.character-model");
    assert.equal(record.importerVersion, 3);
    assert.deepEqual(record.importSettings, { scaleFactor: 0.01, importAnimations: true });
    assert.deepEqual(record.labels, ["hero", "detective"]);
    assert.deepEqual(record.foreignIds, { unityGuid: "unity-character-guid", assetStoreId: "12345" });

    const sidecar = JSON.parse(await readFile(metaPathForSource(source), "utf8"));
    assert.equal(sidecar.guid, guid);
    assert.equal(sidecar.importer.id, "custom.character-model");
    assert.equal(sidecar.importer.settingsVersion, 3);
    assert.deepEqual(sidecar.importer.settings, { scaleFactor: 0.01, importAnimations: true });
    assert.deepEqual(sidecar.labels, ["hero", "detective"]);
    assert.deepEqual(sidecar.foreignIds, { unityGuid: "unity-character-guid", assetStoreId: "12345" });
    assert.equal("sourceHash" in sidecar, false);
    assert.equal("status" in sidecar, false);
    assert.equal("dependencies" in sidecar, false);
    assert.equal("subAssets" in sidecar, false);
    assert.equal("diagnostics" in sidecar, false);
  });
});

test("hidden entries and metadata sidecars are not indexed as assets", async () => {
  await withAssets(async (assetsRoot) => {
    await writeFile(path.join(assetsRoot, ".DS_Store"), "hidden", "utf8");
    await mkdir(path.join(assetsRoot, ".cache"));
    await writeFile(path.join(assetsRoot, ".cache", "preview.png"), "hidden", "utf8");
    await writeFile(path.join(assetsRoot, "Visible.png"), "visible", "utf8");
    await writeFile(path.join(assetsRoot, `orphan${ASSET_META_SUFFIX}`), "{}", "utf8");

    const scanned = await scanAssetIndex(assetsRoot);
    assert.deepEqual(scanned.records.map((record) => record.sourcePath), ["Visible.png"]);
  });
});

test("updating importer settings preserves identity and excludes generated fields", async () => {
  await withAssets(async (assetsRoot) => {
    const source = path.join(assetsRoot, "Road.fbx");
    await writeFile(source, "road", "utf8");
    const original = (await scanAssetIndex(assetsRoot)).records[0];

    await updateAssetMeta(source, {
      importer: {
        id: "braze.model",
        settingsVersion: 2,
        settings: { scaleFactor: 0.01 },
      },
      status: "failed",
      sourceHash: "must-not-persist",
    });

    const next = (await scanAssetIndex(assetsRoot)).records[0];
    assert.equal(next.guid, original.guid);
    assert.equal(next.importerVersion, 2);
    assert.deepEqual(next.importSettings, { scaleFactor: 0.01 });
    const sidecar = JSON.parse(await readFile(metaPathForSource(source), "utf8"));
    assert.equal(sidecar.status, undefined);
    assert.equal(sidecar.sourceHash, undefined);
  });
});
