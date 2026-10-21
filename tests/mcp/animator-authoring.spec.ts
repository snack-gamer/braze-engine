import { expect, test } from 'playwright/test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runtimeAnimationModelDocument } from '../gameplay/runtime-animation-project.mjs';

test('MCP Animator documents round-trip through the Inspector, history and saved prefab owner', async ({ page }) => {
  const client = new Client({ name: 'animator-authoring-regression', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../../scripts/engine-mcp.mjs', import.meta.url))], env: { BRAZE_ENGINE_URL: 'http://127.0.0.1:4373' } }));
  const call = (operation: string, args = {}) => client.callTool({ name: `braze_${operation.replaceAll('.', '_')}`, arguments: args });
  const ok = async (operation: string, args = {}): Promise<any> => {
    const reply = await call(operation, args); expect(reply.isError, JSON.stringify(reply)).not.toBe(true); return reply.structuredContent!.result;
  };
  const folder = await mkdtemp(path.join(os.tmpdir(), 'braze-animator-import-'));
  const sourcePath = path.join(folder, 'Dancer.gltf'), destination = 'Agent Animation/Dancer.gltf';
  try {
    await writeFile(sourcePath, JSON.stringify(runtimeAnimationModelDocument()));
    const preview = await ok('assets.import', { sourcePath, destination });
    const imported = await ok('assets.import', { sourcePath, destination, sourceRevision: preview.sourceRevision, apply: true });
    const record = (await ok('assets.list', { query: destination })).items[0];
    const clip = record.subAssets.find((item: { kind: string }) => item.kind === 'clip'); expect(clip).toBeTruthy();
    const animator = { version: 'braze/animator-component-v2', enabled: true, cullingMode: 'alwaysAnimate',
      controller: { version: 'braze/animator-controller-v1', id: 'dance', name: 'Agent Dance', parameters: [],
        layers: [{ id: 'base', name: 'Base', defaultStateId: 'sway', states: [{ id: 'sway', name: 'Sway',
          motion: { kind: 'clip', clipRef: { guid: record.guid, localId: clip.localId }, speed: 1, loopMode: 'loop' } }] }] } };
    const create = { op: 'object.create', id: 'agent-dancer', primitive: 'gltf', assetRef: imported.assetRef,
      values: { name: 'Agent Dancer', position: [0, 0, -3] } };
    const set = { op: 'component.set', id: create.id, component: 'animator', values: animator };
    const prefab = await ok('prefab.create', { name: 'Agent Dancer', commands: [{ ...create, values: { ...create.values, parentId: 'root' } }, set], apply: true });
    const inspected = await ok('prefab.inspect', { assetGuid: prefab.asset.guid });
    expect(inspected.items[1].animator).toMatchObject(animator);
    await ok('prefab.edit', { assetGuid: prefab.asset.guid, baseRevision: prefab.revision,
      commands: [{ ...set, values: { ...inspected.items[1].animator, updateMode: 'fixedStep' } }], apply: true });
    await page.setViewportSize({ width: 1600, height: 1000 }); await page.goto('/');
    await expect.poll(() => page.locator('html').getAttribute('data-braze-editor-session')).toBeTruthy();
    let sessionId = (await page.locator('html').getAttribute('data-braze-editor-session'))!;
    const live = (operation: string, args = {}) => ok(operation, { sessionId, ...args });
    await expect.poll(async () => (await live('editor.status')).loaded).toBe(true);
    const before = await live('editor.inspect');
    await live('editor.edit', { baseRevision: before.revision, commands: [create, set] });
    await live('editor.edit', { baseRevision: before.revision, commands: [create, set], apply: true });
    const read = async () => (await live('editor.inspect')).items.find((item: { id: string }) => item.id === create.id).animator;
    await live('editor.select', { objectId: create.id });
    await expect(page.getByRole('button', { name: 'Agent Dance 1L · 1S', exact: true })).toBeVisible();
    const updateMode = page.getByLabel('Animator update mode', { exact: true });
    await expect(updateMode).toBeEnabled();
    await updateMode.selectOption('fixedStep'); await expect.poll(async () => (await read()).updateMode).toBe('fixedStep');
    await live('editor.undo'); await expect(updateMode).toHaveValue('normal');
    await live('editor.redo'); await expect(updateMode).toHaveValue('fixedStep');
    await page.getByRole('button', { name: 'Agent Dance 1L · 1S', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Behavior Map', exact: true })).toBeVisible();
    const changed = await live('editor.inspect');
    const invalid = await call('editor.edit', { sessionId, baseRevision: changed.revision, apply: true,
      commands: [{ op: 'object.update', id: create.id, values: { name: 'Must not apply' } },
        { ...set, values: { ...animator, controller: { ...animator.controller, layers: [{ ...animator.controller.layers[0], defaultStateId: 'missing' }] } } }] });
    expect(invalid.isError).toBe(true); expect((await live('editor.inspect')).revision).toBe(changed.revision);
    await live('editor.save'); await page.reload();
    await expect.poll(() => page.locator('html').getAttribute('data-braze-editor-session')).not.toBe(sessionId);
    sessionId = (await page.locator('html').getAttribute('data-braze-editor-session'))!;
    await expect.poll(async () => (await live('editor.status')).loaded).toBe(true);
    expect(await read()).toMatchObject({ ...animator, updateMode: 'fixedStep' });
    const final = await live('editor.inspect');
    await live('editor.edit', { baseRevision: final.revision, apply: true, commands: [{ op: 'object.delete', id: create.id }] });
    await live('editor.save');
  } finally { await client.close(); await rm(folder, { recursive: true, force: true }); }
});
