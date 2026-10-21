import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureAssetMeta } from "../lib/asset-index.mjs";
import { handleAssetUpload } from "./source-upload.mjs";

test("manual binary uploads preserve root unique naming and reject exact-path collisions", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-upload-route-"));
  const server = createServer((req, res) => handleAssetUpload(req, res, 0, { root,
    async describeIndexedAsset(filename) { return { filename, guid: (await ensureAssetMeta(path.join(root, filename))).meta.guid }; } }));
  t.after(async () => { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); await rm(root, { recursive: true, force: true }); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const upload = (params, body = "image bytes") => fetch(`http://127.0.0.1:${server.address().port}/api/assets?${new URLSearchParams(params)}`, { method: "POST", body });
  const first = await (await upload({ name: "badge.png" })).json();
  const second = await (await upload({ name: "badge.png" })).json();
  assert.equal(first.asset.filename, "badge.png"); assert.equal(second.asset.filename, "badge 1.png"); assert.notEqual(first.asset.guid, second.asset.guid);
  assert.deepEqual(first.asset.assetRef, { guid: first.asset.guid, localId: "main" });
  assert.match(first.asset.sourceRevision, /^[a-f0-9]{64}$/);
  const params = { name: "badge.png", folder: "Interface", path: "Icons/badge.png" };
  const nested = await (await upload(params)).json();
  const conflict = await upload(params, "replacement"); assert.equal(conflict.status, 400); assert.match((await conflict.json()).message, /already exists/);
  assert.equal(await readFile(path.join(root, nested.asset.filename), "utf8"), "image bytes");
  assert.equal((await ensureAssetMeta(path.join(root, nested.asset.filename))).meta.guid, nested.asset.guid);
  for (const path of ["../outside.png", ".private/badge.png", "badge.png.braze.meta"]) {
    const invalid = await upload({ name: "badge.png", folder: "UI", path }); assert.equal(invalid.status, 400);
  }
});
