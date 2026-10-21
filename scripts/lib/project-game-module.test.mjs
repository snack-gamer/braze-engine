import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createProjectGameModulePlugin, readRuntimePhysicsCapacity, resolveProjectGameEntry } from "./project-game-module.mjs";

test("runtime body reserves are explicit, bounded and compiled into the project module", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "braze-game-capacity-"));
  try {
    assert.equal(readRuntimePhysicsCapacity(root), 0);
    const config = (value) => writeFile(path.join(root, "braze.project.json"), JSON.stringify(value));
    await writeFile(path.join(root, "game.ts"), "export default { version: 1 };");
    for (const capacity of [0, 16, 4096]) {
      await config({ gameplayEntry: "game.ts", runtimePhysicsCapacity: capacity });
      assert.equal(readRuntimePhysicsCapacity(root), capacity);
      const plugin = createProjectGameModulePlugin(root);
      const source = plugin.load.call({ addWatchFile() {} }, plugin.resolveId("virtual:braze-game-module"));
      assert.ok(source.includes(`runtimePhysicsCapacity = ${capacity};`));
    }
    for (const capacity of [-1, 1.5, 4097, "16"]) {
      await config({ gameplayEntry: "game.ts", runtimePhysicsCapacity: capacity });
      assert.throws(() => readRuntimePhysicsCapacity(root), /runtimePhysicsCapacity/);
    }
    await config({ runtimePhysicsCapacity: 16 });
    assert.equal(readRuntimePhysicsCapacity(root), 16);
    const plugin = createProjectGameModulePlugin(root);
    const source = plugin.load.call({ addWatchFile() { throw new Error("Absent entry must not be watched."); } }, plugin.resolveId("virtual:braze-game-module"));
    assert.match(source, /hasGameModule = false/);
    assert.match(source, /runtimePhysicsCapacity = 16/);
    assert.match(source, /loadProjectInput.*fetch/);
    assert.match(source, /loadRuntimePrefabs.*fetch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("game entries are opt-in, compiled imports and contained inside the project", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "braze-game-entry-"));
  const outside = await mkdtemp(path.join(tmpdir(), "braze-game-entry-outside-"));
  try {
    assert.equal(resolveProjectGameEntry(root), null);
    const config = (gameplayEntry) => writeFile(path.join(root, "braze.project.json"), JSON.stringify({ gameplayEntry }));
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src/main.ts"), "export default { version: 1 };");
    await config("src/main.ts");
    assert.equal(resolveProjectGameEntry(root), await realpath(path.join(root, "src/main.ts")));
    const plugin = createProjectGameModulePlugin(root);
    const id = plugin.resolveId("virtual:braze-game-module");
    const watched = [];
    const source = plugin.load.call({ addWatchFile: (file) => watched.push(file) }, id);
    assert.match(source, /hasGameModule = true/); assert.match(source, /await import\(/); assert.equal(watched.length, 0);
    assert.match(source, /import.meta.hot.accept/);
    plugin.configResolved({ command: "build" });
    const built = await plugin.load.call({ addWatchFile: (file) => watched.push(file) }, id);
    assert.equal(watched.length, 1);
    assert.doesNotMatch(built, /import.meta.hot|replacement/);
    for (const invalid of ["../outside.ts", "/outside.ts", "C:/outside.ts", "src/missing.ts", "https://example.com/main.ts", "src/main.json"]) {
      await config(invalid); assert.throws(() => resolveProjectGameEntry(root), /gameplayEntry/);
    }
    await symlink(path.dirname(root), path.join(root, "external"));
    await config(`external/${path.basename(root)}/src/main.ts`);
    // Canonical containment, not a blanket ban on internal symlinks.
    assert.ok(resolveProjectGameEntry(root).endsWith("src/main.ts"));
    await writeFile(path.join(outside, "outside.ts"), "export default {};");
    await symlink(path.join(outside, "outside.ts"), path.join(root, "linked.ts"));
    await config("linked.ts"); assert.throws(() => resolveProjectGameEntry(root), /escaping/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
