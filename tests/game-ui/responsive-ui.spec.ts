import { test, expect, type Page, type APIRequestContext } from 'playwright/test';
import type { UiDocument } from '../../src/game-ui/domain/ui-document';

async function connect(page: Page, request: APIRequestContext) {
  await expect.poll(() => page.locator('html').getAttribute('data-braze-editor-session')).toBeTruthy();
  const sessionId = await page.locator('html').getAttribute('data-braze-editor-session');
  const call = async (operation: string, data = {}) => {
    const response = await request.post('/api/automation/v1/commands', { headers: { 'X-Braze-Automation': '1' }, data: { version: 1, requestId: crypto.randomUUID(), sessionId, operation, ...data } });
    const envelope = await response.json(); expect(envelope.status, JSON.stringify(envelope)).toBe('ok'); return envelope.result;
  };
  await expect.poll(async () => (await call('editor.status')).loaded).toBe(true);
  return call;
}
const gameUi = (page: Page) => page.locator(page.url().includes('player.html') ? '[data-braze-ui]' : '[data-runtime-input-surface] [data-braze-ui]');

test('saved canvases share agent and Inspector edits, runtime actions/tweens, focus and Play lifetimes', async ({ page, request }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message)); page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1700, height: 1050 }); await page.goto('/');
  let call = await connect(page, request);
  await call('editor.select', { objectId: 'hud' });
  await page.getByLabel('UI element', { exact: true }).selectOption('title');
  await page.getByLabel('UI text', { exact: true }).fill('Treasure Lab');
  await call('editor.undo'); await expect(page.getByLabel('UI text', { exact: true })).toHaveValue('Collect Three');
  await call('editor.redo'); await expect(page.getByLabel('UI text', { exact: true })).toHaveValue('Treasure Lab');
  const inspected = await call('editor.inspect');
  const canvas: UiDocument = inspected.items.find((item: { id: string }) => item.id === 'hud').ui_canvas;
  const edit = { ...canvas, root: { ...canvas.root, children: [...canvas.root.children!, { id: 'name', kind: 'input', label: 'Pilot name', action: 'name', value: '', style: { position: 'absolute', bottom: 80, left: 20, width: 180, background: '$surface', color: '$text', padding: 8 } }] } };
  const batch = { baseRevision: inspected.revision, commands: [{ op: 'component.set', id: 'hud', component: 'uiCanvas', values: edit }] };
  expect((await call('editor.edit', batch)).applied).toBe(false);
  await call('editor.edit', { ...batch, apply: true }); await call('editor.save');
  await page.reload(); call = await connect(page, request);
  expect((await call('editor.inspect')).items.find((item: { id: string }) => item.id === 'hud').ui_canvas.root.children[0].children[0].children[1].text).toBe('Treasure Lab');
  await page.getByRole('tab', { name: 'Game', exact: true }).click(); await call('editor.transport', { action: 'play' });
  const ui = gameUi(page); await expect(ui.getByText('Treasure Lab', { exact: true })).toBeVisible();
  const field = ui.getByRole('textbox', { name: 'Pilot name' }); await field.fill('WASD e'); await field.press('Backspace');
  await expect.poll(async () => (await call('editor.ui', { screenId: 'hud' })).items.find((item: { id: string }) => item.id === 'name').value).toBe('WASD ');
  await expect(ui.getByText('0 points', { exact: true })).toBeVisible(); // Typing E must not collect.
  const help = ui.getByRole('button', { name: 'How to play' }); await help.focus(); await page.keyboard.press('Enter');
  await expect(ui.getByText('Your next discovery', { exact: true })).toBeVisible();
  await call('editor.transport', { action: 'pause' });
  const paused = await call('editor.ui', { screenId: 'hud' });
  await page.waitForTimeout(120);
  const held = await call('editor.ui', { screenId: 'hud' });
  expect(held.items.find((item: { id: string }) => item.id === 'notice').style).toEqual(paused.items.find((item: { id: string }) => item.id === 'notice').style);
  expect(held.enabled).toBe(false);
  await call('editor.transport', { action: 'step' }); await call('editor.transport', { action: 'play' });
  await expect.poll(async () => (await call('editor.ui')).activeTweens).toBe(0);
  await ui.getByRole('button', { name: 'Back to the game' }).click(); await expect(ui.getByText('Your next discovery', { exact: true })).toBeHidden();
  await page.keyboard.press('e'); await expect(ui.getByText('1 points', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('editor-ui-collected.png') });
  await call('editor.transport', { action: 'stop' }); await expect(ui).toHaveCount(0);
  await call('editor.transport', { action: 'play' }); await expect(gameUi(page).getByText('0 points', { exact: true })).toBeVisible();
  await call('editor.transport', { action: 'stop' }); expect(errors).toEqual([]);
});

test('static UI adapts to viewport size, operates by keyboard and respects reduced motion without editor APIs', async ({ page }, info) => {
  const apis: string[] = [], errors: string[] = [];
  page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/')) apis.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.message)); page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.goto('http://127.0.0.1:4374/player.html');
  const ui = gameUi(page); await expect(ui.getByText('Collect Three', { exact: true })).toBeVisible();
  await expect(ui.locator('[data-ui-node=header]')).toHaveCSS('flex-direction', 'row');
  await page.screenshot({ path: info.outputPath('player-ui-wide.png') });
  await page.setViewportSize({ width: 390, height: 844 }); await expect(ui.locator('[data-ui-node=header]')).toHaveCSS('flex-direction', 'column');
  const root = await ui.locator('[data-ui-node=root]').boundingBox(); expect(root?.width).toBeLessThanOrEqual(390);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ui.getByRole('button', { name: 'How to play' }).click(); await expect(ui.locator('[data-ui-node=notice]')).toBeVisible(); await expect(ui.locator('[data-ui-node=notice]')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: info.outputPath('player-ui-narrow.png') });
  await ui.getByRole('button', { name: 'Back to the game' }).click(); await expect(ui.locator('[data-ui-node=notice]')).toBeHidden(); await page.keyboard.press('e');
  await expect(ui.getByText('1 points', { exact: true })).toBeVisible(); expect(apis).toEqual([]); expect(errors).toEqual([]);
});
