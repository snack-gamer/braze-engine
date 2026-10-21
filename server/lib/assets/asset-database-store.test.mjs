import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { updateAssetMeta } from "../asset-index.mjs";
import { refreshAssetDatabase } from "./asset-database-store.mjs";
import { metaPathForSource } from "./asset-meta-store.mjs";
import { configuredSubAssets } from "./library-asset-records.mjs";

import { COMPOUND_MODEL_GUID, writeCompoundModel } from "../../../tests/fixtures/compound-model.mjs";

async function withDatabase(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-asset-database-"));
  const assetsRoot = path.join(root, "assets");
  const indexFile = path.join(root, ".braze", "Library", "asset-index.json");
  await mkdir(assetsRoot, { recursive: true });
  try {
    await run({ assetsRoot, indexFile });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("an external source-only rename preserves GUID and importer state when identity is unambiguous", async () => {
  await withDatabase(async ({ assetsRoot, indexFile }) => {
    const source = path.join(assetsRoot, "Hero.fbx");
    const renamed = path.join(assetsRoot, "Characters", "Detective.fbx");
    await writeFile(source, "same model bytes", "utf8");
    const initial = await refreshAssetDatabase({ assetsRoot, indexFile });
    await updateAssetMeta(source, {
      importer: {
        id: "braze.model",
        settingsVersion: 2,
        settings: { rig: { kind: "humanoid" } },
      },
    });
    await mkdir(path.dirname(renamed), { recursive: true });
    await rename(source, renamed);

    const refreshed = await refreshAssetDatabase({ assetsRoot, indexFile });
    assert.equal(refreshed.records.length, 1);
    assert.equal(refreshed.records[0].guid, initial.records[0].guid);
    assert.equal(refreshed.records[0].sourcePath, "Characters/Detective.fbx");
    assert.deepEqual(refreshed.records[0].importSettings, { rig: { kind: "humanoid" } });
    assert.ok(refreshed.diagnostics.some((item) => item.code === "asset-meta-relinked"));
    const sidecar = JSON.parse(await readFile(metaPathForSource(renamed), "utf8"));
    assert.equal(sidecar.guid, initial.records[0].guid);
  });
});

test("external deletion is detected without deleting its recoverable orphaned metadata", async () => {
  await withDatabase(async ({ assetsRoot, indexFile }) => {
    const source = path.join(assetsRoot, "Hero.fbx");
    await writeFile(source, "model", "utf8");
    await refreshAssetDatabase({ assetsRoot, indexFile });
    await rm(source);

    const refreshed = await refreshAssetDatabase({ assetsRoot, indexFile });
    assert.equal(refreshed.records.length, 0);
    assert.ok(refreshed.diagnostics.some((item) => item.code === "orphan-asset-meta"));
    assert.doesNotReject(() => readFile(metaPathForSource(source), "utf8"));
  });
});

test("ambiguous external renames are diagnosed instead of attaching the wrong GUID", async () => {
  await withDatabase(async ({ assetsRoot, indexFile }) => {
    const source = path.join(assetsRoot, "Hero.fbx");
    const firstCopy = path.join(assetsRoot, "Hero A.fbx");
    const secondCopy = path.join(assetsRoot, "Hero B.fbx");
    await writeFile(source, "identical model", "utf8");
    await refreshAssetDatabase({ assetsRoot, indexFile });
    await rename(source, firstCopy);
    await copyFile(firstCopy, secondCopy);

    const refreshed = await refreshAssetDatabase({ assetsRoot, indexFile });
    assert.equal(refreshed.records.length, 2);
    assert.ok(refreshed.diagnostics.some((item) => item.code === "ambiguous-asset-rename"));
    assert.notEqual(refreshed.records[0].guid, refreshed.records[1].guid);
    assert.doesNotReject(() => readFile(metaPathForSource(source), "utf8"));
  });
});

test("source content changes invalidate generated identity without replacing authored metadata", async () => {
  await withDatabase(async ({ assetsRoot, indexFile }) => {
    const source = path.join(assetsRoot, "Hero.fbx");
    await writeFile(source, "model-v1", "utf8");
    const first = await refreshAssetDatabase({ assetsRoot, indexFile });
    await writeFile(source, "model-v2", "utf8");

    const second = await refreshAssetDatabase({ assetsRoot, indexFile });
    assert.equal(second.records[0].guid, first.records[0].guid);
    assert.notEqual(second.records[0].sourceHash, first.records[0].sourceHash);
  });
});

test("an original FBX fixture publishes stable compound model contents through a full database scan", async () => {
  await withDatabase(async ({ assetsRoot, indexFile }) => {
    await writeCompoundModel(assetsRoot);

    const first = await refreshAssetDatabase({ assetsRoot, indexFile });
    const record = first.records[0];
    assert.equal(record.guid, COMPOUND_MODEL_GUID);
    assert.deepEqual(record.subAssets.map(({ kind, name }) => ({ kind, name })), [
      { kind: "model", name: "Compound Character" },
      { kind: "mesh", name: "Body" },
      { kind: "mesh", name: "Trim" },
      { kind: "material", name: "Body Material" },
      { kind: "material", name: "Trim Material" },
      { kind: "clip", name: "Sway" },
      { kind: "skeleton", name: "Hips Skeleton" },
      { kind: "avatar", name: "Hips Avatar" },
    ]);
    assert.ok(Math.abs(record.subAssets.find(({ kind }) => kind === "clip").durationSeconds - 3.6667) < 0.001);
    const configured = configuredSubAssets(record.subAssets, record.importSettings);
    assert.equal(configured.find(({ kind }) => kind === "avatar").configuredRigKind, "humanoid");

    const localIds = record.subAssets.map(({ localId }) => localId);
    const second = await refreshAssetDatabase({ assetsRoot, indexFile });
    assert.equal(second.records[0].guid, record.guid);
    assert.deepEqual(second.records[0].subAssets.map(({ localId }) => localId), localIds);
  });
});
