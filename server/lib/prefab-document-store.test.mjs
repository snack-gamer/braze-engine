import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DocumentConflictError } from "./json-document-store.mjs";
import {
  PREFAB_DOCUMENT_VERSION,
  createPrefabDocument,
  readPrefabDocument,
  validatePrefabDocument,
  writePrefabDocument,
} from "./prefab-document-store.mjs";

function prefab(name = "Crate") {
  return {
    version: PREFAB_DOCUMENT_VERSION,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
    rootIds: ["root"],
    objects: [{ id: "root", primitive: "transform" }],
  };
}

test("prefab creates are atomic and expose the exact content revision", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "braze-prefab-store-"));
  const root = path.join(temporary, "assets");
  const backupsRoot = path.join(temporary, ".braze", "Backups", "prefabs");
  try {
    const created = await createPrefabDocument({
      root,
      backupsRoot,
      filename: "Props/Crate.braze-prefab.json",
      prefab: prefab(),
    });
    const loaded = await readPrefabDocument({
      root,
      filename: "Props/Crate.braze-prefab.json",
    });
    assert.equal(loaded?.revision, created.revision);
    assert.deepEqual(loaded?.value, created.value);
    assert.equal(created.value.version, PREFAB_DOCUMENT_VERSION);
    assert.deepEqual(
      (await readdir(path.dirname(created.filePath))).filter((name) => name.endsWith(".tmp")),
      [],
    );
    assert.deepEqual(JSON.parse(await readFile(created.filePath, "utf8")), created.value);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("prefab writes reject stale revisions and retain bounded backups", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "braze-prefab-conflict-"));
  const root = path.join(temporary, "assets");
  const backupsRoot = path.join(temporary, ".braze", "Backups", "prefabs");
  const filename = "Crate.braze-prefab.json";
  try {
    let current = await createPrefabDocument({ root, backupsRoot, filename, prefab: prefab(), backupLimit: 2 });
    const initialRevision = current.revision;
    current = await writePrefabDocument({
      root,
      backupsRoot,
      filename,
      prefab: prefab("Crate 2"),
      expectedRevision: current.revision,
      backupLimit: 2,
    });
    await assert.rejects(
      writePrefabDocument({
        root,
        backupsRoot,
        filename,
        prefab: prefab("Stale"),
        expectedRevision: initialRevision,
      }),
      DocumentConflictError,
    );
    for (let index = 3; index <= 5; index += 1) {
      current = await writePrefabDocument({
        root,
        backupsRoot,
        filename,
        prefab: prefab(`Crate ${index}`),
        expectedRevision: current.revision,
        backupLimit: 2,
      });
    }
    const backupDirectory = path.join(backupsRoot, filename);
    assert.equal((await readdir(backupDirectory)).length, 2);
    assert.equal((await readPrefabDocument({ root, filename }))?.value.name, "Crate 5");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("prefab validation accepts legacy documents and rejects invalid identity", () => {
  assert.doesNotThrow(() => validatePrefabDocument({
    ...prefab(),
    version: "tgan/prefab-v1",
  }));
  assert.throws(
    () => validatePrefabDocument({ ...prefab(), version: "braze/prefab-v99" }),
    /Unsupported prefab document version/,
  );
  assert.throws(
    () => validatePrefabDocument({ ...prefab(), objects: [{ id: " ", primitive: "cube" }] }),
    /non-empty id/,
  );
  assert.throws(
    () => validatePrefabDocument({
      ...prefab(),
      objects: [{ id: "same" }, { id: " same " }],
    }),
    /duplicate object id same/,
  );
});
