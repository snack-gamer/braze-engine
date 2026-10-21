import { expect, test, type Page, type APIRequestContext } from 'playwright/test';
import { stockControlPixels } from '../stock-controls/stock-controls-pixels';

async function liveCommands(page: Page, request: APIRequestContext) {
  await expect.poll(() => page.locator('html').getAttribute('data-braze-editor-session')).toBeTruthy();
  const sessionId = await page.locator('html').getAttribute('data-braze-editor-session');
  const invoke = async (operation: string, values = {}) => {
    const response = await request.post('/api/automation/v1/commands', { headers: { 'X-Braze-Automation': '1' },
      data: { version: 1, requestId: crypto.randomUUID(), sessionId, operation, ...values } });
    const result = await response.json(); expect(result.status, JSON.stringify(result)).toBe('ok'); return result.result;
  };
  await expect.poll(async () => (await invoke('editor.status')).loaded).toBe(true);
  return invoke;
}

async function collectFirst(page: Page, logs: string[], points: number) {
  const viewport = page.getByLabel('Game render viewport', { exact: true });
  await expect(viewport).toBeVisible();
  await page.addStyleTag({ content: '.viewport-hud { visibility: hidden !important; }' });
  await expect.poll(async () => (await stockControlPixels(page)).orange.count).toBeGreaterThan(100);
  const before = (await stockControlPixels(page)).orange.count;
  await viewport.click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('e');
  await expect.poll(() => logs.filter((line) => line === `[Game] Score: ${points}`).length).toBe(1);
  expect(logs).not.toContain('[Game] All three collectibles found!');
  await expect.poll(async () => (await stockControlPixels(page)).orange.count).toBeLessThan(before - 20);
}

test('JavaScript classes are discoverable, manually editable, undoable and replayable through public workflows', async ({ page, request }, info) => {
  const logs: string[] = [], errors: string[] = [];
  page.on('console', (message) => { logs.push(message.text()); if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 }); await page.goto('/');
  let invoke = await liveCommands(page, request);
  const catalog = await invoke('editor.behaviors');
  expect(catalog.definitions.map((definition: { id: string }) => definition.id)).toEqual(expect.arrayContaining([
    'starter.collectible', 'braze.control.first-person', 'braze.control.third-person', 'braze.control.top-down',
  ]));
  expect(catalog.definitions.find((definition: { id: string }) => definition.id === 'starter.collectible').fields)
    .toEqual(expect.arrayContaining([expect.objectContaining({ key: 'points', kind: 'number', default: 1 })]));
  expect(logs.some((line) => line.startsWith('[Game]'))).toBe(false); // Discovery does not start a world.
  await invoke('editor.select', { objectId: 'collectible-1' });
  const points = page.getByRole('spinbutton', { name: 'Collectible: Points', exact: true });
  await expect(points).toBeVisible(); await points.fill('2'); await points.press('Tab');
  const readPoints = async () => (await invoke('editor.inspect')).items.find((item: { id: string }) => item.id === 'collectible-1').behaviors.entries[0].values.points;
  await expect.poll(readPoints).toBe(2); await invoke('editor.undo'); await expect.poll(readPoints).toBe(1);
  await invoke('editor.redo'); await expect.poll(readPoints).toBe(2); await invoke('editor.save');
  await page.reload(); invoke = await liveCommands(page, request); await expect.poll(readPoints).toBe(2);
  await page.getByRole('tab', { name: 'Game', exact: true }).click();
  await invoke('editor.transport', { action: 'play' });
  await expect.poll(async () => (await invoke('editor.status')).physics?.status).toBe('running');
  await collectFirst(page, logs, 2); await page.screenshot({ path: info.outputPath('collected-editor.png') });
  await invoke('editor.transport', { action: 'stop' });
  expect((await invoke('editor.inspect')).items.some((item: { id: string }) => item.id === 'collectible-1')).toBe(true);
  logs.length = 0; await invoke('editor.transport', { action: 'play' });
  await expect.poll(async () => (await invoke('editor.status')).physics?.status).toBe('running');
  await collectFirst(page, logs, 2); await invoke('editor.transport', { action: 'stop' });
  expect(errors).toEqual([]);
});

test('the generated JavaScript game runs from a static build without editor APIs', async ({ page }, info) => {
  const logs: string[] = [], errors: string[] = [], apis: string[] = [];
  page.on('console', (message) => { logs.push(message.text()); if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/')) apis.push(request.url()); });
  await page.setViewportSize({ width: 1600, height: 1000 }); await page.goto('http://127.0.0.1:4374/player.html');
  await expect.poll(() => logs.some((line) => line.startsWith('[Game] WASD'))).toBe(true);
  await collectFirst(page, logs, 1); await page.screenshot({ path: info.outputPath('collected-player.png') });
  expect(apis).toEqual([]); expect(errors).toEqual([]);
});
