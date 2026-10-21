import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DocumentConflictError } from "../json-document-store.mjs";
import {
  ensureAssetMeta,
  metaPathForSource,
  updateAssetMeta,
} from "./asset-meta-store.mjs";

async function withSource(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-asset-meta-"));
  const source = path.join(root, "Hero.fbx");
  await writeFile(source, "model", "utf8");
  try {
    await run(source);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("asset metadata writes reject a stale revision and retain the newer document", async () => {
  await withSource(async (source) => {
    const loaded = await ensureAssetMeta(source);
    const saved = await updateAssetMeta(source, { labels: ["hero"] }, {
      expectedRevision: loaded.revision,
    });
    await assert.rejects(
      updateAssetMeta(source, { labels: ["stale"] }, { expectedRevision: loaded.revision }),
      (error) => error instanceof DocumentConflictError,
    );
    const reloaded = await ensureAssetMeta(source);
    assert.equal(reloaded.revision, saved.revision);
    assert.deepEqual(reloaded.meta.labels, ["hero"]);
  });
});

test("malformed authored metadata is diagnosed and never overwritten automatically", async () => {
  await withSource(async (source) => {
    const metaFilename = metaPathForSource(source);
    await writeFile(metaFilename, "{ broken metadata", "utf8");
    const loaded = await ensureAssetMeta(source);
    assert.ok(loaded.diagnostics.some((item) => item.code === "invalid-meta"));
    assert.equal(await readFile(metaFilename, "utf8"), "{ broken metadata");
    await assert.rejects(updateAssetMeta(source, { labels: ["unsafe"] }), /invalid asset metadata/);
    assert.equal(await readFile(metaFilename, "utf8"), "{ broken metadata");
  });
});

test("equivalent metadata key order does not rewrite an authored sidecar", async () => {
  await withSource(async (source) => {
    const metaFilename = metaPathForSource(source);
    const authored = `${JSON.stringify({
      guid: "0123456789abcdef0123456789abcdef",
      importer: { id: "braze.model", settings: {}, settingsVersion: 1 },
      labels: [],
      foreignIds: {},
      fileFormatVersion: 1,
    }, null, 2)}\n`;
    await writeFile(metaFilename, authored, "utf8");

    await ensureAssetMeta(source);

    assert.equal(await readFile(metaFilename, "utf8"), authored);
  });
});
