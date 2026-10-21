import { expect, test } from 'playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

test('project source edits preserve the live world and unsaved editor history until the next Play', async ({ page, request }) => {
  const root = process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT!;
  const entry = path.join(root, 'assets/Scripts/main.js');
  const system = path.join(root, 'assets/Scripts/Systems/ScoreSystem.js');
  const originalEntry = await readFile(entry, 'utf8'), originalSystem = await readFile(system, 'utf8');
  const logs: string[] = [], errors: string[] = [];
  page.on('console', (message) => { logs.push(message.text()); if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect.poll(() => page.locator('html').getAttribute('data-braze-editor-session')).toBeTruthy();
  const sessionId = await page.locator('html').getAttribute('data-braze-editor-session');
  const invoke = async (operation: string, values = {}) => {
    const response = await request.post('/api/automation/v1/commands', { headers: { 'X-Braze-Automation': '1' },
      data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values } });
    const reply = await response.json(); expect(reply.status, JSON.stringify(reply)).toBe('ok'); return reply.result;
  };
  const transport = (action: string) => invoke('editor.transport', { action });
  const collect = async (points: number) => {
    const ui = page.locator('[data-runtime-input-surface] [data-braze-ui]');
    await expect(ui.getByText('0 points', { exact: true })).toBeVisible();
    await page.getByLabel('Game render viewport', { exact: true }).click({ position: { x: 20, y: 20 } });
    await page.keyboard.down('e');
    try { await expect(ui.getByText(`${points} points`, { exact: true })).toBeVisible(); }
    finally { await page.keyboard.up('e'); }
  };
  const updated = async (file: string, source: string) => {
    const start = logs.length;
    await writeFile(file, source);
    await expect.poll(() => ({ errors, updated: logs.slice(start).some((line) => line.includes('[vite] hot updated:')) })).toEqual({ errors: [], updated: true });
    expect(await page.locator('html').getAttribute('data-braze-editor-session')).toBe(sessionId);
  };
  try {
    await expect.poll(async () => (await invoke('editor.status')).loaded).toBe(true);
    const before = await invoke('editor.inspect');
    const initialPoints = Number(before.items.find((item: { id: string }) => item.id === 'collectible-1').behaviors.entries[0].values.points);
    await invoke('editor.edit', { baseRevision: before.revision, sceneId: before.sceneId, apply: true,
      commands: [{ op: 'object.update', id: 'collectible-1', values: { name: 'Unsaved source-edit draft' } }] });
    await page.getByRole('tab', { name: 'Game', exact: true }).click();
    await transport('play');
    await expect.poll(async () => (await invoke('editor.status')).physics?.status).toBe('running');
    await updated(system, originalSystem.replace('Number(payload?.points ?? 0)', '2 * Number(payload?.points ?? 0)'));
    // The old system closure owns this Play; imported replacement classes start next Play.
    await collect(initialPoints); await transport('stop');
    expect((await invoke('editor.inspect')).items.find((item: { id: string }) => item.id === 'collectible-1').name).toBe('Unsaved source-edit draft');
    await transport('play'); await collect(initialPoints * 2); await transport('stop');
    const draft = await invoke('editor.inspect');
    await updated(entry, originalEntry.replace('return new ScoreSystem(context);', "console.info('[HMR] replacement entry'); return new ScoreSystem(context);"));
    expect(logs).not.toContain('[HMR] replacement entry');
    const current = await invoke('editor.inspect');
    expect(current.revision).toBe(draft.revision);
    expect(current.items.find((item: { id: string }) => item.id === 'collectible-1').name).toBe('Unsaved source-edit draft');
    await invoke('editor.undo');
    expect((await invoke('editor.inspect')).items.find((item: { id: string }) => item.id === 'collectible-1').name)
      .toBe(before.items.find((item: { id: string }) => item.id === 'collectible-1').name);
    await transport('play'); await collect(initialPoints * 2); await expect.poll(() => logs.includes('[HMR] replacement entry')).toBe(true);
    await transport('pause'); await transport('step'); await transport('stop');
    expect(errors).toEqual([]);
  } finally {
    await page.close(); await writeFile(system, originalSystem); await writeFile(entry, originalEntry);
  }
});
