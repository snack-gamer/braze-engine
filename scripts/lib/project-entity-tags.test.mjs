import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { readProjectEntityTags } from "./project-entity-tags.mjs";
import { createProjectGameModulePlugin } from "./project-game-module.mjs";

test("project tags use the configured source and static players embed a saved snapshot", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "braze-tags-build-"));
  try {
    assert.equal(readProjectEntityTags(root), undefined);
    await mkdir(path.join(root, "settings"));
    await writeFile(path.join(root, "game.ts"), "export default { version: 1 };");
    await writeFile(path.join(root, "braze.project.json"), JSON.stringify({ gameplayEntry: "game.ts", projectFile: "settings/project.json" }));
    const catalog = { version: 1, names: ["Actor", "Collectible"] };
    await writeFile(path.join(root, "settings/project.json"), JSON.stringify({ entityTags: catalog }));
    assert.deepEqual(readProjectEntityTags(root), catalog);
    const plugin = createProjectGameModulePlugin(root);
    const id = plugin.resolveId("virtual:braze-game-module");
    const context = { addWatchFile() {} };
    assert.match(await plugin.load.call(context, id), /fetch\('\/api\/project'/);
    plugin.configResolved({ command: "build" });
    const built = await plugin.load.call(context, id);
    assert.ok(built.includes(JSON.stringify(catalog)));
    assert.ok(!built.includes("/api/project"));
    await writeFile(path.join(root, "settings/project.json"), JSON.stringify({ entityTags: { version: 1, names: [] } }));
    assert.ok(built.includes(JSON.stringify(catalog)));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("project tag sources reject traversal and symlink escapes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "braze-tags-source-"));
  const outside = await mkdtemp(path.join(tmpdir(), "braze-tags-outside-"));
  try {
    const config = (projectFile) => writeFile(path.join(root, "braze.project.json"), JSON.stringify({ projectFile }));
    await config("../outside.json");
    assert.throws(() => readProjectEntityTags(root), /escapes/);
    await writeFile(path.join(outside, "project.json"), "{}");
    await symlink(path.join(outside, "project.json"), path.join(root, "linked.json"));
    await config("linked.json");
    assert.throws(() => readProjectEntityTags(root), /escapes/);
    await writeFile(path.join(root, "oversized.json"), " ".repeat(8 * 1024 * 1024 + 1));
    await config("oversized.json");
    assert.throws(() => readProjectEntityTags(root), /exceeds/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
