import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rename, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { loadRuntimePrefabSources, readRuntimePrefabReferences } from "./project-runtime-prefabs.mjs";

const guid = "a".repeat(32), asset = { guid, localId: "main" };
test("runtime prefab configuration requires bounded durable asset references", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "braze-prefab-config-"));
  try {
    assert.deepEqual(readRuntimePrefabReferences(root), []);
    const config = (runtimePrefabs, extra = {}) => writeFile(path.join(root, "braze.project.json"), JSON.stringify({ gameplayEntry: "game.ts", runtimePhysicsCapacity: 16, runtimePrefabs, ...extra }));
    await config([{ guid: guid.toUpperCase() }]); assert.deepEqual(readRuntimePrefabReferences(root), [asset]);
    for (const invalid of [[{ filename: "Crate.braze-prefab.json" }], [asset, asset], [{ guid, localId: "child" }], Array(33).fill(asset)]) {
      await config(invalid); assert.throws(() => readRuntimePrefabReferences(root));
    }
    await config([asset], { runtimePhysicsCapacity: 0 }); assert.deepEqual(readRuntimePrefabReferences(root), [asset]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("saved prefab loading follows GUIDs through renames and captures source revisions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "braze-prefab-sources-"));
  try {
    const original = { version: "braze/prefab-v1", objects: [{ id: "root" }] };
    await writeFile(path.join(root, "One.braze-prefab.json"), JSON.stringify(original));
    const record = { guid, kind: "prefab", status: "ready", name: "One", filename: "One.braze-prefab.json" };
    const first = await loadRuntimePrefabSources([asset], [record], root);
    await rename(path.join(root, record.filename), path.join(root, "Renamed.braze-prefab.json"));
    record.filename = "Renamed.braze-prefab.json";
    assert.deepEqual(await loadRuntimePrefabSources([asset], [record], root), first);
    await writeFile(path.join(root, record.filename), JSON.stringify({ ...original, name: "Saved edit" }));
    const changed = await loadRuntimePrefabSources([asset], [record], root);
    assert.notEqual(changed[0].revision, first[0].revision); assert.deepEqual(first[0].document, original);
    await assert.rejects(loadRuntimePrefabSources([asset], [], root), /missing/);
    await assert.rejects(loadRuntimePrefabSources([asset], [record, record], root), /ambiguous/);
    await assert.rejects(loadRuntimePrefabSources([asset], [{ ...record, status: "failed" }], root), /ready/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("prefab loading rejects escaping sources, oversized files and excessive node counts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "braze-prefab-boundary-"));
  try {
    const assets = path.join(root, "assets"); await mkdir(assets);
    await writeFile(path.join(root, "outside.json"), JSON.stringify({ objects: [{ id: "root" }] }));
    await symlink(path.join(root, "outside.json"), path.join(assets, "link.braze-prefab.json"));
    const record = { guid, kind: "prefab", name: "Test", filename: "link.braze-prefab.json" };
    await assert.rejects(loadRuntimePrefabSources([asset], [record], assets), /escapes/);
    record.filename = "large.braze-prefab.json";
    await writeFile(path.join(assets, record.filename), " ".repeat(1024 * 1024 + 1));
    await assert.rejects(loadRuntimePrefabSources([asset], [record], assets), /limit/);
    await writeFile(path.join(assets, record.filename), JSON.stringify({ objects: Array(129).fill({ id: "node" }) }));
    await assert.rejects(loadRuntimePrefabSources([asset], [record], assets), /128/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
