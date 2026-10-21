import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSourceImportCommand } from "./source-import-command.mjs";
import { refreshAssetDatabase } from "./asset-database-store.mjs";
import { DocumentConflictError } from "../json-document-store.mjs";
import { SOURCE_IMPORT_MAX_BYTES } from "../../../src/assets/domain/source-import-contract.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-source-command-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const assetsRoot = path.join(root, "Assets"), sourcePath = path.join(root, "triangle.gltf");
  const model = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "Triangle", mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ uri: "mesh.bin", byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }] };
  await writeFile(sourcePath, JSON.stringify(model));
  const database = () => refreshAssetDatabase({ assetsRoot, indexFile: path.join(root, "Library/index.json") });
  const execute = createSourceImportCommand({ root: assetsRoot, refreshAssetDatabase: database });
  const request = { operation: "assets.import", sourcePath, destination: "Models/triangle.gltf" };
  const command = (values = {}) => execute({ ...request, ...values });
  return { root, assetsRoot, sourcePath, database, command, request };
}

test("preview has no authored/index writes; import preserves dependency layout and stable identity", async (t) => {
  const f = await fixture(t), preview = await f.command();
  assert.equal(preview.applied, false); assert.match(preview.sourceRevision, /^[a-f0-9]{64}$/);
  assert.deepEqual(await readdir(f.root), ["triangle.gltf"]);
  const sourcePath = path.join(f.root, "mesh.bin"), destination = "Models/mesh.bin";
  await writeFile(sourcePath, Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer));
  const dependency = await f.command({ sourcePath, destination });
  await f.command({ sourcePath, destination, sourceRevision: dependency.sourceRevision, apply: true });
  const imported = await f.command({ sourceRevision: preview.sourceRevision, apply: true });
  assert.equal(imported.applied, true); assert.equal(imported.indexingError, null);
  assert.equal(imported.asset.sourcePath, f.request.destination);
  assert.deepEqual(imported.assetRef, { guid: imported.asset.guid, localId: "main" });
  assert.deepEqual(await readFile(path.join(f.assetsRoot, imported.filename)), await readFile(f.sourcePath));
  assert.equal((await f.database()).records.find((record) => record.sourcePath === imported.filename).guid, imported.guid);
  assert.deepEqual((await readdir(f.assetsRoot)).filter((entry) => entry.startsWith(".")), []);
  await assert.rejects(f.command(), /already exists/);
  await assert.rejects(f.command({ sourceRevision: preview.sourceRevision, apply: true }), /already exists/);
});

test("changed source fails before publication and can be previewed again", async (t) => {
  const f = await fixture(t), preview = await f.command();
  await writeFile(f.sourcePath, "different bytes");
  await assert.rejects(f.command({ sourceRevision: preview.sourceRevision, apply: true }), DocumentConflictError);
  assert.deepEqual(await readdir(f.assetsRoot), []);
  const current = await f.command(); assert.notEqual(current.sourceRevision, preview.sourceRevision);
  const imported = await f.command({ sourceRevision: current.sourceRevision, apply: true });
  assert.equal(imported.applied, true); assert.equal(imported.asset.status, "failed");
  assert.ok(imported.asset.diagnostics.length, "invalid model remains visible as an import diagnostic");
});

test("concurrent imports cannot replace existing bytes or an orphaned sidecar identity", async (t) => {
  const f = await fixture(t), preview = await f.command();
  const results = await Promise.allSettled([f.command({ sourceRevision: preview.sourceRevision, apply: true }), f.command({ sourceRevision: preview.sourceRevision, apply: true })]);
  assert.equal(results.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.match(results.find((entry) => entry.status === "rejected").reason.message, /already exists/);
  const sidecar = path.join(f.assetsRoot, "orphan.gltf.braze.meta"); await writeFile(sidecar, "retain identity");
  await assert.rejects(f.command({ destination: "orphan.gltf" }), /already exists/);
  assert.equal(await readFile(sidecar, "utf8"), "retain identity");
});

test("unsafe paths, symlinks, unsupported types and malformed revisions fail without writing", async (t) => {
  const f = await fixture(t);
  for (const destination of ["../escape.gltf", "/escape.gltf", "Models/../escape.gltf", "a\\b.gltf", ".hidden/a.gltf", "a//b.gltf", "a?b.gltf", "Model.gltf.braze.meta", " leading.gltf", "a /b.gltf", "wrong.png"]) {
    await assert.rejects(f.command({ destination }));
  }
  for (const values of [{ sourcePath: "relative.gltf" }, { sourcePath: "https://example.com/a.gltf" }, { sourcePath: f.sourcePath + "\0" },
    { sourcePath: path.join(f.root, "script.js"), destination: "script.js" }, { apply: "true" }, { apply: true }, { apply: true, sourceRevision: "old" }]) await assert.rejects(f.command(values));
  await mkdir(f.assetsRoot); await symlink(f.root, path.join(f.assetsRoot, "escape"));
  await assert.rejects(f.command({ destination: "escape/new.gltf" }), /regular directory/);
  await symlink(path.join(f.root, "absent"), path.join(f.assetsRoot, "dangling.gltf"));
  await assert.rejects(f.command({ destination: "dangling.gltf" }), /already exists/);
  assert.deepEqual((await readdir(f.root)).sort(), ["Assets", "triangle.gltf"]);
});

test("directories, oversized files and named pipes fail promptly without source reads", async (t) => {
  const f = await fixture(t), sourcePath = path.join(f.root, "other.gltf");
  await mkdir(sourcePath); await assert.rejects(f.command({ sourcePath }), /regular local file/); await rm(sourcePath, { recursive: true });
  await writeFile(sourcePath, ""); await truncate(sourcePath, SOURCE_IMPORT_MAX_BYTES + 1);
  await assert.rejects(f.command({ sourcePath }), /agent import limit/); await rm(sourcePath);
  if (process.platform !== "win32") {
    execFileSync("mkfifo", [sourcePath]);
    await assert.rejects(f.command({ sourcePath }), /regular local file/);
  }
});

test("failed post-publication indexing reports a committed import instead of suggesting a replay", async (t) => {
  const f = await fixture(t), preview = await f.command();
  const execute = createSourceImportCommand({ root: f.assetsRoot, refreshAssetDatabase: async () => { throw new Error("index unavailable"); } });
  const result = await execute({ ...f.request, sourceRevision: preview.sourceRevision, apply: true });
  assert.equal(result.applied, true); assert.equal(result.asset, null); assert.match(result.indexingError, /do not replay/);
  assert.deepEqual(await readFile(path.join(f.assetsRoot, result.filename)), await readFile(f.sourcePath));
});
