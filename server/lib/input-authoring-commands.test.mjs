import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createInputAuthoringCommands } from "./input-authoring-commands.mjs";
import { createInputMapAuthoring } from "./input-map-authoring.mjs";
import { refreshAssetDatabase } from "./assets/asset-database-store.mjs";
import { ensureAssetMeta } from "./asset-index.mjs";
import { DocumentConflictError } from "./json-document-store.mjs";
import { ProjectSectionConflictError, readProjectDocument, updateProjectDocument } from "./project-document-store.mjs";

const document = (code = "KeyJ") => ({ version: "braze/input-action-map-v1", name: "Controls", map: { version: 1,
  actions: [{ name: "collect", kind: "button", bindings: [{ device: "keyboard", code }] }] } });
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-input-authoring-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const assetsRoot = path.join(root, "assets"); await mkdir(assetsRoot);
  const database = () => refreshAssetDatabase({ assetsRoot, indexFile: path.join(root, "Library/index.json") });
  const maps = createInputMapAuthoring({ root: assetsRoot, backupsRoot: path.join(root, "backups"),
    availableFilename(filename) { let candidate = filename, index = 1;
      while (existsSync(path.join(assetsRoot, candidate))) candidate = filename.replace(/\.braze-input\.json$/, `-${index++}.braze-input.json`);
      return candidate;
    },
    async describeIndexedAsset(filename, contentRevision) {
      const { meta } = await ensureAssetMeta(path.join(assetsRoot, filename));
      return { filename, guid: meta.guid, kind: "inputActionMap", importerId: meta.importer.id, status: "ready", contentRevision };
    },
  });
  const project = { filePath: path.join(root, "project.json"), legacyFilePath: null, backupDirectory: path.join(root, "project-backups") };
  const execute = createInputAuthoringCommands({ maps, refreshAssetDatabase: database, ...project });
  const command = (operation, values = {}) => execute({ operation, ...values });
  const create = async () => command("input.map.create", { document: document(), apply: true });
  return { root, assetsRoot, maps, project, command, create };
}

test("create previews allocate no source, then manual and agent paths read the same stable asset", async (t) => {
  const f = await fixture(t);
  const preview = await f.command("input.map.create", { document: document(), folder: "Input" });
  assert.equal(preview.applied, false); assert.equal(preview.asset, null); assert.deepEqual(await readdir(f.assetsRoot), []);
  const first = await f.create(), second = await f.create();
  assert.notEqual(first.asset.guid, second.asset.guid); assert.notEqual(first.asset.filename, second.asset.filename);
  assert.deepEqual(await f.command("input.map.inspect", { assetGuid: first.asset.guid }), await f.maps.inspect(first.asset.filename));
  assert.equal(first.document.map.actions[0].bindings[0].scale, 1);
  for (const values of [{ folder: "../escape" }, { apply: "true" }, { document: { ...document(), name: " " } }]) {
    await assert.rejects(f.command("input.map.create", { document: document(), ...values }));
  }
});

test("saves preview, preserve GUID through rename, back up bytes and reject racing stale writes", async (t) => {
  const f = await fixture(t), initial = await f.create(), assetGuid = initial.asset.guid;
  const edit = { assetGuid, baseRevision: initial.revision, document: document("KeyK") };
  assert.equal((await f.command("input.map.save", edit)).applied, false);
  assert.equal((await f.maps.inspect(initial.asset.filename)).revision, initial.revision);
  const destination = "Renamed.braze-input.json";
  for (const suffix of ["", ".braze.meta"]) await rename(path.join(f.assetsRoot, initial.asset.filename + suffix), path.join(f.assetsRoot, destination + suffix));
  assert.equal((await f.command("input.map.inspect", { assetGuid })).asset.filename, destination);
  const writes = await Promise.allSettled([f.command("input.map.save", { ...edit, apply: true }),
    f.maps.save(destination, { ...edit, document: document("KeyL") })]);
  assert.equal(writes.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.ok(writes.find((entry) => entry.status === "rejected").reason instanceof DocumentConflictError);
  const saved = await f.command("input.map.inspect", { assetGuid });
  assert.notEqual(saved.revision, initial.revision); assert.equal(saved.asset.guid, assetGuid);
  assert.ok((await readdir(path.join(f.root, "backups", destination))).length > 0);
  await assert.rejects(f.command("input.map.save", { ...edit, apply: true }), DocumentConflictError);
  await assert.rejects(f.command("input.map.save", { ...edit, baseRevision: saved.revision, document: document("invalid-key!"), apply: true }));
  assert.equal((await f.command("input.map.inspect", { assetGuid })).revision, saved.revision);
});

test("project selection uses its own revision, preserves other sections and can clear a missing map", async (t) => {
  const f = await fixture(t), asset = await f.create();
  const initial = await f.command("input.project.inspect"); assert.equal(initial.revision, null);
  const request = { assetGuid: asset.asset.guid, baseRevision: null };
  assert.equal((await f.command("input.project.select", request)).applied, false);
  assert.equal((await f.command("input.project.inspect")).revision, null);
  await updateProjectDocument({ ...f.project, patch: { materials: ["untouched"] }, expectedSectionRevisions: { materials: null } });
  const selected = await f.command("input.project.select", { ...request, apply: true });
  assert.deepEqual((await readProjectDocument(f.project)).value.materials, ["untouched"]);
  assert.equal((await f.command("input.project.inspect")).mapRevision, asset.revision);
  await assert.rejects(f.command("input.project.select", { assetGuid: null, baseRevision: null, apply: true }), ProjectSectionConflictError);
  await assert.rejects(f.command("input.project.select", { baseRevision: selected.revision, apply: true }), /assetGuid/);
  await rm(path.join(f.assetsRoot, asset.asset.filename));
  const missing = await f.command("input.project.inspect"); assert.match(missing.problem, /missing|ready/i);
  assert.equal(missing.settings.actionMap.guid, asset.asset.guid);
  await f.command("input.project.select", { assetGuid: null, baseRevision: selected.revision, apply: true });
  assert.deepEqual((await f.command("input.project.inspect")).settings, { version: 1 });
});

test("GUID resolution rejects ambiguous, invalid and wrong-type assets before changing input", async (t) => {
  const f = await fixture(t), first = await f.create();
  const source = path.join(f.assetsRoot, first.asset.filename);
  const meta = await readFile(`${source}.braze.meta`, "utf8");
  const copy = path.join(f.assetsRoot, "Duplicate.braze-input.json");
  await writeFile(copy, await readFile(source)); await writeFile(`${copy}.braze.meta`, meta);
  await assert.rejects(f.command("input.map.inspect", { assetGuid: first.asset.guid }), /ambiguous|ready/);
  await assert.rejects(f.command("input.project.select", { assetGuid: first.asset.guid, baseRevision: null, apply: true }));
  const png = path.join(f.assetsRoot, "image.png"); await writeFile(png, "not a map");
  const other = await ensureAssetMeta(png);
  await assert.rejects(f.command("input.map.inspect", { assetGuid: other.meta.guid }), /not a ready Input Action Map/);
  await assert.rejects(f.command("input.map.inspect", { assetGuid: "../escape" }), /GUID/);
  await assert.rejects(f.command("input.shell"), /Unknown input operation/);
  assert.equal((await f.command("input.project.inspect")).revision, null);
});
