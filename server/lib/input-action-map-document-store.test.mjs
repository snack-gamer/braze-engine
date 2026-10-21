import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DocumentConflictError, documentRevision } from "./json-document-store.mjs";
import { createInputActionMapDocument, readInputActionMapDocument, writeInputActionMapDocument } from "./input-action-map-document-store.mjs";

const document = (code = "KeyJ") => ({ version: "braze/input-action-map-v1", name: "Controls", map: { version: 1,
  actions: [{ name: "fire", kind: "button", bindings: [{ device: "keyboard", code, scale: 1 }] }] } });
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "braze-input-store-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { root: path.join(directory, "assets"), backupsRoot: path.join(directory, "backups"), filename: "Controls.braze-input.json" };
}

test("input map writes preserve exact revision, immutable values and the prior source backup", async (t) => {
  const options = await fixture(t), initial = await createInputActionMapDocument({ ...options, document: document() });
  const before = await readFile(initial.filePath, "utf8");
  assert.equal(initial.revision, documentRevision(before));
  const saved = await writeInputActionMapDocument({ ...options, document: document("KeyK"), expectedRevision: initial.revision });
  assert.notEqual(saved.revision, initial.revision);
  const loaded = await readInputActionMapDocument(options);
  assert.deepEqual(loaded.value, document("KeyK")); assert.equal(loaded.revision, saved.revision);
  assert.ok(Object.isFrozen(loaded.value.map.actions[0].bindings[0]));
  const backups = await readdir(path.join(options.backupsRoot, options.filename));
  assert.equal(backups.length, 1); assert.equal(await readFile(path.join(options.backupsRoot, options.filename, backups[0]), "utf8"), before);
  const unchanged = await writeInputActionMapDocument({ ...options, document: document("KeyK"), expectedRevision: saved.revision });
  assert.equal(unchanged.changed, false); assert.equal(unchanged.revision, saved.revision);
});

test("two saves based on the same revision publish only one complete document", async (t) => {
  const options = await fixture(t), initial = await createInputActionMapDocument({ ...options, document: document() });
  const results = await Promise.allSettled(["KeyK", "KeyL"].map((code) => writeInputActionMapDocument({ ...options, document: document(code), expectedRevision: initial.revision })));
  assert.equal(results.filter((value) => value.status === "fulfilled").length, 1);
  const failed = results.find((value) => value.status === "rejected");
  assert.ok(failed.reason instanceof DocumentConflictError);
  const current = await readInputActionMapDocument(options);
  assert.equal(failed.reason.actualRevision, current.revision);
  assert.deepEqual(current.value, results.find((value) => value.status === "fulfilled").value.value);
});

test("invalid maps and missing save revisions leave the canonical source intact", async (t) => {
  const options = await fixture(t), initial = await createInputActionMapDocument({ ...options, document: document() });
  const before = await readFile(initial.filePath, "utf8");
  await assert.rejects(writeInputActionMapDocument({ ...options, document: document(), expectedRevision: undefined }), /loaded revision/);
  await assert.rejects(writeInputActionMapDocument({ ...options, document: { ...document(), map: { version: 2 } }, expectedRevision: initial.revision }), /version/);
  await assert.rejects(createInputActionMapDocument({ ...options, document: document("KeyK") }), DocumentConflictError);
  assert.equal(await readFile(initial.filePath, "utf8"), before);
});

test("input map paths reject traversal, external symlinks and oversized source bytes", async (t) => {
  const options = await fixture(t), initial = await createInputActionMapDocument({ ...options, document: document() });
  for (const filename of ["../Controls.braze-input.json", "/Controls.braze-input.json", "file:Controls.braze-input.json", "sub\\Controls.braze-input.json", "sub//Controls.braze-input.json"])
    await assert.rejects(readInputActionMapDocument({ ...options, filename }), /project-relative/);
  const external = path.join(path.dirname(options.root), "external.braze-input.json");
  await writeFile(external, JSON.stringify(document())); await symlink(external, path.join(options.root, "Link.braze-input.json"));
  await assert.rejects(readInputActionMapDocument({ ...options, filename: "Link.braze-input.json" }), /escapes/);
  await writeFile(initial.filePath, " ".repeat(256 * 1024 + 1));
  await assert.rejects(readInputActionMapDocument(options), /256 KiB/);
});

test("a replaced asset identity cannot overwrite source bytes with a still-current content revision", async (t) => {
  const options = await fixture(t), initial = await createInputActionMapDocument({ ...options, document: document() });
  const expectedGuid = "ab".repeat(16), before = await readFile(initial.filePath, "utf8");
  await writeFile(`${initial.filePath}.braze.meta`, JSON.stringify({ guid: "ff".repeat(16), importer: { id: "braze.input-action-map" } }));
  await assert.rejects(writeInputActionMapDocument({ ...options, document: document("KeyK"), expectedRevision: initial.revision, expectedGuid }), /identity changed/);
  assert.equal(await readFile(initial.filePath, "utf8"), before);
  await writeFile(`${initial.filePath}.braze.meta`, JSON.stringify({ guid: expectedGuid, importer: { id: "braze.model" } }));
  await assert.rejects(writeInputActionMapDocument({ ...options, document: document("KeyK"), expectedRevision: initial.revision, expectedGuid }), /identity changed/);
  assert.equal((await readInputActionMapDocument(options)).revision, initial.revision);
});
