import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPrefabAuthoringCommands } from "./prefab-authoring-commands.mjs";
import { writePrefabDocument } from "./prefab-document-store.mjs";
import { DocumentConflictError } from "./json-document-store.mjs";

const guid = "a".repeat(32);
// Transport/store tests inject authoring; TypeScript tests cover the actual feature commands.
const authoring = {
  createPrefab: (name) => ({ document: { version: "braze/prefab-v1", name, rootIds: ["root"], objects: [{ id: "root" }] }, valid: true }),
  inspectPrefab: (document) => ({ document, valid: true }),
  executePrefabCommands: (input, commands) => ({ document: { ...input, name: commands[0].name }, valid: commands[0].valid !== false, diagnostics: ["invalid graph"] }),
};
async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-prefab-agent-")), backupsRoot = path.join(root, "Backups");
  let filename;
  const describeIndexedAsset = async (sourcePath) => {
    filename = sourcePath;
    const meta = path.join(root, `${filename}.braze.meta`);
    try { await writeFile(meta, JSON.stringify({ guid, importer: { id: "braze.prefab" } }), { flag: "wx" }); } catch (error) { if (error.code !== "EEXIST") throw error; }
    return { guid: JSON.parse(await readFile(meta, "utf8")).guid, filename };
  };
  const execute = createPrefabAuthoringCommands({ root, backupsRoot, loadAuthoring: async () => authoring, describeIndexedAsset,
    refreshAssetDatabase: async () => ({ records: filename ? [{ guid, sourcePath: filename, kind: "prefab", importerId: "braze.prefab" }] : [] }) });
  try { await run({ root, backupsRoot, execute, setFilename: (value) => { filename = value; } }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("prefab previews, manual/agent stale writes, backups and GUID resolution after move", () => fixture(async ({ root, backupsRoot, execute, setFilename }) => {
  const create = { operation: "prefab.create", name: "Cargo", commands: [{}], folder: "Props" };
  const preview = await execute(create); assert.equal(preview.applied, false); assert.deepEqual(await readdir(root), []);
  const saved = await execute({ ...create, apply: true }); assert.equal(saved.asset.guid, guid);
  const inspected = await execute({ operation: "prefab.inspect", assetGuid: guid, limit: 1 });
  assert.equal(inspected.revision, saved.revision); assert.equal(inspected.nextOffset, null);
  const edit = { operation: "prefab.edit", assetGuid: guid, baseRevision: saved.revision, commands: [{ name: "Edited" }] };
  await execute(edit); assert.equal((await execute({ operation: "prefab.inspect", assetGuid: guid })).metadata.name, "Cargo");
  const changed = await execute({ ...edit, apply: true }); assert.notEqual(changed.revision, saved.revision);
  await assert.rejects(execute({ ...edit, apply: true }), DocumentConflictError);
  await assert.rejects(writePrefabDocument({ root, backupsRoot, filename: saved.filename, prefab: authoring.createPrefab("Manual draft").document, expectedRevision: saved.revision }), DocumentConflictError);
  assert.equal((await readdir(path.join(backupsRoot, saved.filename))).length, 1);
  await mkdir(path.join(root, "Moved"));
  const moved = "Moved/Renamed.braze-prefab.json";
  for (const suffix of ["", ".braze.meta"]) await rename(path.join(root, saved.filename + suffix), path.join(root, moved + suffix));
  setFilename(moved);
  const afterMove = await execute({ operation: "prefab.edit", assetGuid: guid, baseRevision: changed.revision, commands: [{ name: "Moved cargo" }], apply: true });
  assert.equal(afterMove.asset.guid, guid); assert.equal(afterMove.asset.filename, moved);
}));

test("prefab writes reject invalid batches, identity changes and ambiguous GUIDs", () => fixture(async ({ root, execute }) => {
  const saved = await execute({ operation: "prefab.create", name: "Cargo", commands: [{}], apply: true });
  const edit = { operation: "prefab.edit", assetGuid: guid, baseRevision: saved.revision, commands: [{ name: "Bad", valid: false }], apply: true };
  await assert.rejects(execute(edit), /validation failed/);
  assert.equal((await execute({ operation: "prefab.inspect", assetGuid: guid })).revision, saved.revision);
  await writeFile(path.join(root, `${saved.filename}.braze.meta`), JSON.stringify({ guid: "b".repeat(32), importer: { id: "braze.prefab" } }));
  await assert.rejects(execute({ ...edit, commands: [{ name: "Unexpected" }] }), /identity changed/);
  await assert.rejects(writePrefabDocument({ root, filename: saved.filename, prefab: authoring.createPrefab("Unexpected").document, expectedRevision: saved.revision, expectedGuid: guid }), /identity changed/);
  const ambiguous = createPrefabAuthoringCommands({ loadAuthoring: async () => authoring, refreshAssetDatabase: async () => ({ records: [{ guid }, { guid }] }) });
  await assert.rejects(ambiguous({ operation: "prefab.inspect", assetGuid: guid }), /ambiguous/);
}));

test("prefab creation rejects traversal and retains orphaned asset identity", () => fixture(async ({ root, execute }) => {
  await assert.rejects(execute({ operation: "prefab.create", name: "Cargo", commands: [{}], folder: "../outside" }), /relative/);
  await writeFile(path.join(root, "Cargo.braze-prefab.json.braze.meta"), "orphan identity");
  const created = await execute({ operation: "prefab.create", name: "Cargo", commands: [{}], apply: true });
  assert.equal(created.filename, "Cargo 1.braze-prefab.json");
  assert.equal(await readFile(path.join(root, "Cargo.braze-prefab.json.braze.meta"), "utf8"), "orphan identity");
}));
