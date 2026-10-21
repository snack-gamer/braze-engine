import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PROJECT_DOCUMENT_VERSION,
  ProjectSectionConflictError,
  readProjectDocument,
  updateProjectDocument,
} from "./project-document-store.mjs";
import { writeJsonDocument } from "./json-document-store.mjs";

test("project sections merge independently and reject same-section stale writes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-project-"));
  const filePath = path.join(root, "project.json");
  const backupDirectory = path.join(root, "backups");
  try {
    const initial = await readProjectDocument({ filePath });
    const materials = await updateProjectDocument({
      filePath,
      backupDirectory,
      patch: { materials: [{ id: "mat-1" }] },
      expectedSectionRevisions: { materials: null },
    });
    const assets = await updateProjectDocument({
      filePath,
      backupDirectory,
      patch: { assets: { folders: ["models"] } },
      expectedSectionRevisions: { assets: initial.sectionRevisions.assets ?? null },
    });
    assert.deepEqual(assets.value.materials, [{ id: "mat-1" }]);
    assert.deepEqual(assets.value.assets, { folders: ["models"] });
    assert.equal(assets.value.version, PROJECT_DOCUMENT_VERSION);

    await assert.rejects(
      updateProjectDocument({
        filePath,
        backupDirectory,
        patch: { materials: [] },
        expectedSectionRevisions: { materials: null },
      }),
      ProjectSectionConflictError,
    );
    assert.ok(materials.sectionRevisions.materials);
    assert.equal((await readdir(backupDirectory)).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy engine project data migrates to the game project document", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-project-migrate-"));
  const legacyFilePath = path.join(root, "engine", "project.json");
  const filePath = path.join(root, "game", "project.json");
  try {
    await writeJsonDocument({ filePath: legacyFilePath, value: { materials: [{ id: "legacy" }] } });
    const legacy = await readProjectDocument({ filePath, legacyFilePath });
    const migrated = await updateProjectDocument({
      filePath,
      legacyFilePath,
      patch: { assets: { folders: [] } },
      expectedSectionRevisions: { assets: null },
    });
    assert.equal(legacy.source, legacyFilePath);
    assert.deepEqual(migrated.value.materials, [{ id: "legacy" }]);
    assert.equal((await readProjectDocument({ filePath })).source, filePath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("authored character assets retain versioned and unknown fields as an independent section", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-project-character-assets-"));
  const filePath = path.join(root, "project.json");
  const characterAssets = {
    version: "braze/character-assets-v1",
    animatorControllers: [{ id: "a".repeat(32), revision: "r1", name: "Locomotion" }],
    avatarMasks: [],
    futureMetadata: { retained: true },
  };
  try {
    const written = await updateProjectDocument({
      filePath,
      patch: { characterAssets },
      expectedSectionRevisions: { characterAssets: null },
    });
    await updateProjectDocument({
      filePath,
      patch: { materials: [{ id: "material" }] },
      expectedSectionRevisions: { materials: null },
    });

    assert.deepEqual((await readProjectDocument({ filePath })).value.characterAssets, characterAssets);
    await assert.rejects(
      updateProjectDocument({
        filePath,
        patch: { characterAssets: { ...characterAssets, avatarMasks: [{ id: "b".repeat(32) }] } },
        expectedSectionRevisions: { characterAssets: null },
      }),
      ProjectSectionConflictError,
    );
    assert.ok(written.sectionRevisions.characterAssets);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy request-envelope pollution is recovered without persisting transport fields", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-project-envelope-"));
  const legacyFilePath = path.join(root, "engine", "project.json");
  const filePath = path.join(root, "game", "project.json");
  try {
    await writeJsonDocument({
      filePath: legacyFilePath,
      value: {
        materials: [{ id: "old" }],
        assets: { folders: ["models"] },
        patch: { materials: [{ id: "recovered" }] },
        expectedSectionRevisions: { materials: null },
      },
    });
    const legacy = await readProjectDocument({ filePath, legacyFilePath });
    assert.deepEqual(legacy.value.materials, [{ id: "recovered" }]);
    assert.equal(legacy.value.patch, undefined);
    assert.equal(legacy.value.expectedSectionRevisions, undefined);
    assert.equal(legacy.value.version, PROJECT_DOCUMENT_VERSION);

    const migrated = await updateProjectDocument({
      filePath,
      legacyFilePath,
      patch: { assets: { folders: ["models", "textures"] } },
      expectedSectionRevisions: { assets: legacy.sectionRevisions.assets },
    });
    assert.deepEqual(migrated.value.materials, [{ id: "recovered" }]);
    assert.equal(migrated.value.patch, undefined);
    assert.equal(migrated.value.expectedSectionRevisions, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unknown future project document versions are rejected", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-project-version-"));
  const filePath = path.join(root, "project.json");
  try {
    await writeJsonDocument({ filePath, value: { version: "braze-engine/project-v99" } });
    await assert.rejects(
      readProjectDocument({ filePath }),
      /Unsupported project document version/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
