import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access, mkdir, symlink, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createJavascriptProject } from './create-javascript-project.mjs';
import { createProjectGameModulePlugin, resolveProjectGameEntry } from './project-game-module.mjs';

test('creates a contained JavaScript class project with two consumers and refuses to overwrite it', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'braze-script-project-test-'));
  const root = path.join(parent, 'My Game');
  try {
    const result = await createJavascriptProject(root, { name: 'My Game' });
    assert.equal(result.entry, 'assets/Scripts/main.js');
    assert.match(resolveProjectGameEntry(root), /assets\/Scripts\/main.js$/);
    const plugin = createProjectGameModulePlugin(root);
    assert.match(plugin.resolveId('@braze/game'), /src\/gameplay\/public.ts$/);
    assert.equal(plugin.resolveId('@braze/private'), undefined);
    const scene = JSON.parse(await readFile(path.join(root, 'scenes/current.scene.json'), 'utf8'));
    const collectibles = scene.objects.filter((object) => object.behaviors?.entries.some((entry) => entry.type === 'starter.collectible'));
    assert.equal(collectibles.length, 3);
    assert.ok(collectibles.every((object) => object.behaviors.entries[0].values.player.entityId === 'player'));
    await access(path.join(root, 'assets/Scripts/Behaviors/Collectible.js'));
    await access(path.join(root, 'assets/Scripts/Systems/ScoreSystem.js'));
    const before = await readFile(path.join(root, 'braze.project.json'), 'utf8');
    await assert.rejects(createJavascriptProject(root), { code: 'EEXIST' });
    assert.equal(await readFile(path.join(root, 'braze.project.json'), 'utf8'), before);
    const config = JSON.parse(await readFile(path.join(root, 'jsconfig.json'), 'utf8'));
    assert.equal(config.compilerOptions.checkJs, true);
    assert.equal(config.compilerOptions.allowJs, true);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('scaffolds portable SDK paths from a canonical symlinked parent directory', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'braze-script-symlink-'));
  try {
    const target = path.join(parent, 'nested', 'projects'), link = path.join(parent, 'shortcut');
    await mkdir(target, { recursive: true }); await symlink(target, link);
    const result = await createJavascriptProject(path.join(link, 'Game'));
    const canonical = await realpath(result.root);
    const config = JSON.parse(await readFile(path.join(canonical, 'jsconfig.json'), 'utf8'));
    const project = JSON.parse(await readFile(path.join(canonical, 'braze.project.json'), 'utf8'));
    const engine = await realpath(new URL('../..', import.meta.url));
    assert.equal(await realpath(path.resolve(canonical, project.enginePath)), engine);
    assert.equal(await realpath(path.resolve(canonical, config.extends)), path.join(engine, 'tsconfig.json'));
    for (const directory of config.compilerOptions.typeRoots) await access(path.resolve(canonical, directory));
  } finally { await rm(parent, { recursive: true, force: true }); }
});
