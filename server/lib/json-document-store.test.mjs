import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DocumentConflictError,
  readJsonDocument,
  writeJsonDocument,
  writeTextAtomic,
} from "./json-document-store.mjs";

test("JSON document writes are revision-checked, atomic, and backed up", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-json-store-"));
  const filePath = path.join(root, "documents", "scene.json");
  const backupDirectory = path.join(root, "backups");
  try {
    const first = await writeJsonDocument({ filePath, value: { value: 1 }, expectedRevision: null, backupDirectory });
    assert.equal(first.changed, true);
    assert.deepEqual((await readJsonDocument(filePath))?.value, { value: 1 });

    const unchanged = await writeJsonDocument({
      filePath,
      value: { value: 1 },
      expectedRevision: first.revision,
      backupDirectory,
    });
    assert.equal(unchanged.changed, false);

    await assert.rejects(
      writeJsonDocument({ filePath, value: { value: 2 }, expectedRevision: "stale", backupDirectory }),
      DocumentConflictError,
    );
    const second = await writeJsonDocument({
      filePath,
      value: { value: 2 },
      expectedRevision: first.revision,
      backupDirectory,
    });
    assert.notEqual(second.revision, first.revision);
    assert.equal((await readdir(backupDirectory)).length, 1);
    assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), { value: 2 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("JSON document backups retain only the configured history depth", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-json-backups-"));
  const filePath = path.join(root, "project.json");
  const backupDirectory = path.join(root, "backups");
  try {
    let revision = null;
    for (let value = 0; value < 5; value += 1) {
      ({ revision } = await writeJsonDocument({
        filePath,
        value: { value },
        expectedRevision: revision,
        backupDirectory,
        backupLimit: 2,
      }));
    }
    assert.equal((await readdir(backupDirectory)).length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("atomic text writes remove their temporary file after a failed rename", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-atomic-cleanup-"));
  const blockedTarget = path.join(root, "target.json");
  try {
    await mkdir(blockedTarget);
    await assert.rejects(writeTextAtomic(blockedTarget, "{}\n"));
    const entries = await readdir(root);
    assert.deepEqual(entries, ["target.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
