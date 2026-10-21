import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { ensureAssetMeta } from "../asset-index.mjs";
import { writeImportedSource } from "./source-import-writer.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-source-writer-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, write: (options = {}) => writeImportedSource({ root, destination: "image.png", openSource: () => Readable.from(["image bytes"]), ...options }) };
}
test("stream failure, byte cap and metadata failure leave no partially imported sources", async (t) => {
  const f = await fixture(t);
  for (const options of [{ maxBytes: 2 }, { metadata: async () => { throw new Error("metadata unavailable"); } },
    { openSource: () => Readable.from((async function* () { yield "partial"; throw new Error("interrupted upload"); })()) }]) {
    await assert.rejects(f.write(options)); assert.deepEqual(await readdir(f.root), []);
  }
  assert.ok((await f.write()).guid, "failure does not poison the import queue");
});
test("an external writer winning publication is preserved and our staged sidecar is removed", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.write({ metadata: async (source) => {
    const result = await ensureAssetMeta(source); await writeFile(path.join(f.root, "image.png"), "external bytes"); return result;
  } }), /already exists/);
  assert.deepEqual(await readdir(f.root), ["image.png"]);
  assert.equal(await readFile(path.join(f.root, "image.png"), "utf8"), "external bytes");
});
test("manual unique naming preserves compound types and allocates fresh identities under concurrency", async (t) => {
  const f = await fixture(t), options = { destination: "Controls.braze-input.json", unique: true };
  const [first, second] = await Promise.all([f.write(options), f.write(options)]);
  assert.equal(first.filename, "Controls.braze-input.json"); assert.equal(second.filename, "Controls 1.braze-input.json");
  assert.notEqual(first.guid, second.guid);
  await writeFile(path.join(f.root, "image.png.braze.meta"), "orphan identity");
  assert.equal((await f.write({ unique: true })).filename, "image 1.png");
});
