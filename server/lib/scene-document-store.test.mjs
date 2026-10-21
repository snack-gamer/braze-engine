import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DocumentConflictError, writeJsonDocument } from "./json-document-store.mjs";
import {
  listSceneDocuments,
  normalizeSceneId,
  patchSceneDocument,
  readSceneDocument,
  validateSceneDocument,
  writeSceneDocument,
} from "./scene-document-store.mjs";

const scene = (name) => ({ version: "braze-engine/scene-v1", savedAt: name, objects: [] });

test("scene ids stay filename-safe and scene envelopes reject duplicate ids", () => {
  assert.equal(normalizeSceneId("level-01"), "level-01");
  assert.throws(() => normalizeSceneId("../outside"));
  assert.throws(() => validateSceneDocument({
    version: "braze-engine/scene-v1",
    objects: [{ id: "same" }, { id: "same" }],
  }));
  assert.throws(() => validateSceneDocument({
    version: "braze-engine/scene-v99",
    objects: [],
  }), /Scene version must be/);
});

test("scene patches update only changed objects while preserving order", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-scene-patch-"));
  try {
    const initialScene = {
      version: "braze-engine/scene-v1",
      savedAt: "first",
      objects: [{ id: "a", value: 1 }, { id: "b", value: 1 }],
    };
    const initial = await writeSceneDocument({ root, id: "current", scene: initialScene, expectedRevision: null });
    const patched = await patchSceneDocument({
      root,
      id: "current",
      expectedRevision: initial.revision,
      patch: {
        metadata: { savedAt: "second" },
        upsertObjects: [{ id: "b", value: 2 }, { id: "c", value: 3 }],
        removeObjectIds: ["a"],
        objectOrder: ["c", "b"],
      },
    });
    assert.deepEqual(patched.value, {
      version: "braze-engine/scene-v1",
      savedAt: "second",
      objects: [{ id: "c", value: 3 }, { id: "b", value: 2 }],
    });
    await assert.rejects(
      patchSceneDocument({ root, id: "current", expectedRevision: initial.revision, patch: {} }),
      DocumentConflictError,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scene store lists documents and rejects stale revisions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-scenes-"));
  const backupsRoot = path.join(root, ".backups");
  try {
    const first = await writeSceneDocument({
      root,
      backupsRoot,
      id: "level-01",
      scene: scene("first"),
      expectedRevision: null,
    });
    await assert.rejects(
      writeSceneDocument({ root, backupsRoot, id: "level-01", scene: scene("stale"), expectedRevision: null }),
      DocumentConflictError,
    );
    await writeSceneDocument({
      root,
      backupsRoot,
      id: "level-01",
      scene: scene("second"),
      expectedRevision: first.revision,
    });
    assert.deepEqual((await listSceneDocuments(root)).map(({ id }) => id), ["level-01"]);
    assert.equal((await readSceneDocument({ root, id: "level-01" }))?.value.savedAt, "second");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("current scene can migrate from the legacy root without losing revision checks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-scenes-current-"));
  const legacyRoot = path.join(root, "legacy");
  const canonicalRoot = path.join(root, "canonical");
  try {
    const legacy = await writeJsonDocument({
      filePath: path.join(legacyRoot, "current.scene.json"),
      value: scene("legacy"),
      expectedRevision: null,
    });
    assert.deepEqual(
      (await listSceneDocuments(canonicalRoot, legacyRoot)).map(({ id }) => id),
      ["current"],
    );
    const migrated = await writeSceneDocument({
      root: canonicalRoot,
      legacyRoot,
      id: "current",
      scene: scene("canonical"),
      expectedRevision: legacy.revision,
    });
    assert.equal(
      (await readSceneDocument({ root: canonicalRoot, legacyRoot, id: "current" }))?.revision,
      migrated.revision,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("named scenes keep independent objects, revisions and rename identity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-scene-isolation-"));
  try {
    const a = { ...scene("first"), name: "Level One", objects: [{ id: "shared-id", name: "A" }], physics: { gravity: [0,-3,0] } };
    const b = { ...scene("second"), name: "Level Two", objects: [{ id: "shared-id", name: "B" }] };
    const [ra, rb] = await Promise.all([
      writeSceneDocument({ root, id: "a", scene: a, expectedRevision: null }),
      writeSceneDocument({ root, id: "b", scene: b, expectedRevision: null }),
    ]);
    await patchSceneDocument({ root, id: "a", expectedRevision: ra.revision, patch: { metadata: { name: "Renamed One" } } });
    assert.deepEqual((await readSceneDocument({ root, id: "b" })).value, b);
    assert.equal((await readSceneDocument({ root, id: "b" })).revision, rb.revision);
    const listed = await listSceneDocuments(root); assert.deepEqual(listed.map(({ id, name, objectCount }) => ({ id, name, objectCount })), [
      { id: "a", name: "Renamed One", objectCount: 1 }, { id: "b", name: "Level Two", objectCount: 1 },
    ]);
    await assert.rejects(writeSceneDocument({ root, id: "a", scene: b, expectedRevision: null }), DocumentConflictError);
  } finally { await rm(root, { recursive: true, force: true }); }
});
