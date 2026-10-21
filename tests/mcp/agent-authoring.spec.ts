import { expect, test, type Page } from 'playwright/test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import { stockControlPixels } from '../stock-controls/stock-controls-pixels';

type ObservedObject = { id: string; behaviors: { version: number; entries: { values: Record<string, unknown> }[] } };
type SceneSnapshot = { sceneId: string; sceneInstanceId: number; revision: string | number; items: ObservedObject[];
  applied?: boolean; exists?: boolean; loaded?: boolean; physics?: { status: string } };

async function connect() {
  const client = new Client({ name: 'braze-agent-acceptance', version: '1' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath,
      args: [fileURLToPath(new URL('../../scripts/engine-mcp.mjs', import.meta.url))], env: { BRAZE_ENGINE_URL: 'http://127.0.0.1:4373' } }));
  } catch (error) { await client.close(); throw error; }
  const call = (operation: string, args = {}) => client.callTool({ name: `braze_${operation.replaceAll('.', '_')}`, arguments: args });
  const ok = async <T = SceneSnapshot>(operation: string, args = {}) => {
    const result = await call(operation, args); expect(result.isError, JSON.stringify(result)).not.toBe(true);
    return result.structuredContent as { status: string; result: T };
  };
  return { client, call, ok };
}
async function session(page: Page) {
  await expect.poll(() => page.locator('html').getAttribute('data-braze-editor-session')).toBeTruthy();
  return await page.locator('html').getAttribute('data-braze-editor-session') as string;
}

test('MCP saved edits preview atomically and preserve revision conflicts', async () => {
  const { client, call, ok } = await connect();
  try {
    expect((await client.listTools()).tools).toHaveLength(44);
    const initial = (await ok('scene.inspect', { sceneId: 'mcp-saved' })).result;
    expect(initial.exists).toBe(false);
    const edit = { sceneId: 'mcp-saved', baseRevision: null, commands: [
      { op: 'object.create', id: 'camera', primitive: 'camera' },
      { op: 'object.create', id: 'cube', primitive: 'cube', values: { position: [0, 1, 0] } },
    ] };
    expect((await ok('scene.edit', edit)).result.applied).toBe(false);
    expect((await ok('scene.inspect', { sceneId: 'mcp-saved' })).result.exists).toBe(false);
    const applied = (await ok('scene.edit', { ...edit, apply: true })).result;
    expect(applied.applied).toBe(true); expect(typeof applied.revision).toBe('string');
    const conflict = await call('scene.edit', { ...edit, apply: true });
    expect(conflict.isError).toBe(true); expect(conflict.structuredContent?.status).toBe('conflict');
    expect(conflict.structuredContent?.actualRevision).toBe(applied.revision);
    const invalid = await call('scene.edit', { sceneId: 'mcp-saved', baseRevision: applied.revision, apply: true, commands: [
      { op: 'object.update', id: 'cube', values: { name: 'must not apply' } },
      { op: 'object.delete', id: 'missing' },
    ] });
    expect(invalid.isError).toBe(true);
    expect((await ok('scene.inspect', { sceneId: 'mcp-saved' })).result.revision).toBe(applied.revision);
  } finally { await client.close(); }
});

test('MCP changes one intended tab, shares manual undo/save, and produces playable JavaScript behavior', async ({ page, context }, info) => {
  const { client, call, ok } = await connect();
  const logs: string[] = [], errors: string[] = [];
  page.on('console', (message) => { logs.push(message.text()); if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  const second = await context.newPage();
  try {
    await page.setViewportSize({ width: 1600, height: 1000 }); await page.goto('/');
    const sessionId = await session(page);
    await expect.poll(async () => (await ok('editor.status', { sessionId })).result.loaded).toBe(true);
    await second.goto('/'); const secondId = await session(second);
    await expect.poll(async () => (await ok('editor.status', { sessionId: secondId })).result.loaded).toBe(true);
    const sessions = (await ok<{ sessionId: string }[]>('editor.sessions')).result;
    expect(sessions.map((item) => item.sessionId)).toEqual(expect.arrayContaining([sessionId, secondId]));
    const definitions = (await ok<{ definitions: { id: string; fields: unknown[] }[] }>('editor.behaviors', { sessionId })).result.definitions;
    expect(definitions.find((entry) => entry.id === 'starter.collectible')!.fields)
      .toContainEqual(expect.objectContaining({ key: 'points', kind: 'number', default: 1 }));
    const inspect = async (id = sessionId) => (await ok('editor.inspect', { sessionId: id })).result;
    const initial = await inspect();
    const envelope = initial.items.find((item) => item.id === 'collectible-1')!.behaviors;
    envelope.entries[0].values.points = 5;
    const edit = { sessionId, sceneId: initial.sceneId, sceneInstanceId: initial.sceneInstanceId, baseRevision: initial.revision,
      commands: [{ op: 'component.set', id: 'collectible-1', component: 'behaviors', values: envelope }] };
    expect((await ok('editor.edit', edit)).result.applied).toBe(false);
    expect((await inspect()).revision).toBe(initial.revision);
    await ok('editor.edit', { ...edit, apply: true });
    const revised = (await inspect()).revision;
    expect((await call('editor.edit', { ...edit, apply: true })).isError).toBe(true);
    expect((await inspect()).revision).toBe(revised);
    expect((await inspect(secondId)).items.find((item) => item.id === 'collectible-1')!.behaviors.entries[0].values.points).toBe(1);
    await second.close();
    await ok('editor.select', { sessionId, objectId: 'collectible-1' });
    const points = page.getByRole('spinbutton', { name: 'Collectible: Points', exact: true });
    await expect(points).toHaveValue('5.000');
    await page.getByRole('button', { name: /^Undo \(/ }).click(); await expect(points).toHaveValue('1.000');
    await ok('editor.redo', { sessionId }); await expect(points).toHaveValue('5.000');
    await ok('editor.save', { sessionId }); await page.reload(); const reopened = await session(page);
    await expect.poll(async () => (await ok('editor.status', { sessionId: reopened })).result.loaded).toBe(true);
    expect((await inspect(reopened)).items.find((item) => item.id === 'collectible-1')!.behaviors.entries[0].values.points).toBe(5);
    await page.getByRole('tab', { name: 'Game', exact: true }).click();
    await ok('editor.transport', { sessionId: reopened, action: 'play' });
    await expect.poll(async () => (await ok('editor.status', { sessionId: reopened })).result.physics?.status).toBe('running');
    await page.addStyleTag({ content: '.viewport-hud { visibility: hidden !important; }' });
    await expect.poll(async () => (await stockControlPixels(page)).orange.count).toBeGreaterThan(100);
    const before = (await stockControlPixels(page)).orange.count;
    await page.getByLabel('Game render viewport', { exact: true }).click({ position: { x: 20, y: 20 } }); await page.keyboard.press('e');
    await expect.poll(() => logs.includes('[Game] Score: 5')).toBe(true);
    expect(logs).not.toContain('[Game] All three collectibles found!');
    await expect.poll(async () => (await stockControlPixels(page)).orange.count).toBeLessThan(before - 20);
    await page.screenshot({ path: info.outputPath('mcp-game-collected.png') });
    await ok('editor.transport', { sessionId: reopened, action: 'stop' });
    expect((await inspect(reopened)).items.some((item: { id: string }) => item.id === 'collectible-1')).toBe(true);
    expect(errors).toEqual([]);
  } finally { await second.close(); await client.close(); }
});
