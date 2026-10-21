import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { deleteSceneDocument, listSceneDocuments, readSceneDocument, writeSceneDocument, patchSceneDocument } from "./scene-document-store.mjs";
const scene = { version: "braze-engine/scene-v1", name: "Deleted", objects: [] };

test("scene deletion preserves exact bytes in Trash and rejects delayed writes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "braze-delete-"));
  const input = { root: path.join(dir, "scenes"), trashRoot: path.join(dir, "Trash"), id: "level" };
  try {
    const written = await writeSceneDocument({ ...input, scene, expectedRevision: null });
    const original = await readFile(path.join(input.root, "level.scene.json"), "utf8");
    await assert.rejects(deleteSceneDocument({ ...input, expectedRevision: "stale" }), /changed/);
    await assert.rejects(deleteSceneDocument(input), /requires a scene revision/);
    const deleted = await deleteSceneDocument({ ...input, expectedRevision: written.revision });
    assert.equal(await readSceneDocument(input), null);
    assert.deepEqual(await listSceneDocuments(input.root), []);
    assert.equal(await readFile(path.join(input.trashRoot, deleted.trashId, "level.scene.json"), "utf8"), original);
    await assert.rejects(writeSceneDocument({ ...input, scene, expectedRevision: written.revision }), /changed/);
    await assert.rejects(patchSceneDocument({ ...input, patch: {}, expectedRevision: written.revision }), /does not exist/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("deleting a canonical Main Scene does not resurrect its legacy predecessor", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "braze-delete-legacy-"));
  const input = { root: path.join(dir, "scenes"), legacyRoot: path.join(dir, "legacy"), trashRoot: path.join(dir, "Trash"), id: "current" };
  try {
    await writeSceneDocument({ root: input.legacyRoot, id: "current", scene, expectedRevision: null });
    const legacy = await readSceneDocument(input);
    const saved = await writeSceneDocument({ ...input, scene: { ...scene, name: "Canonical" }, expectedRevision: legacy.revision });
    await deleteSceneDocument({ ...input, expectedRevision: saved.revision });
    assert.equal(await readSceneDocument(input), null);
    assert.deepEqual(await listSceneDocuments(input.root, input.legacyRoot), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
