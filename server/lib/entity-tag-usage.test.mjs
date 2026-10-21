import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectEntityTagUsage } from "./entity-tag-usage.mjs";

test("tag audit finds scene and prefab assignments and reports incomplete/malformed sources", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "braze-tag-usage-"));
  const scenesRoot = path.join(root, "scenes"), assetsRoot = path.join(root, "assets");
  try {
    await mkdir(scenesRoot); await mkdir(assetsRoot);
    const object = { id: "hero", name: "Hero", tags: ["Player"] };
    await writeFile(path.join(scenesRoot, "current.scene.json"), JSON.stringify({ objects: [object] }));
    await writeFile(path.join(assetsRoot, "Hero.braze-prefab.json"), JSON.stringify({ objects: [object] }));
    let usage = await collectEntityTagUsage({ scenesRoot, assetsRoot });
    assert.equal(usage.complete, true); assert.equal(usage.assignments.length, 2);
    assert.deepEqual(usage.assignments.map((item) => item.kind), ["scene", "prefab"]);
    await writeFile(path.join(assetsRoot, "Broken.braze-prefab.json"), '{"objects":[{"tags":["A","B"]}]}');
    await symlink(path.join(scenesRoot, "current.scene.json"), path.join(assetsRoot, "Link.braze-prefab.json"));
    usage = await collectEntityTagUsage({ scenesRoot, assetsRoot });
    assert.equal(usage.complete, false); assert.equal(usage.assignments.length, 2);
    assert.ok(usage.issues.some((issue) => issue.includes("invalid entity tags")));
    assert.ok(usage.issues.some((issue) => issue.includes("symbolic link")));
  } finally { await rm(root, { recursive: true, force: true }); }
});
