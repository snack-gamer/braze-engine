import { test, expect } from 'playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Browser boundary simulation: exercises standard Gamepad polling, not physical hardware.
test('media assets, visual editing and controller focus survive save, resize and Play lifetimes', async ({ page, request }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false }));
    const pad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    Object.defineProperty(window, '__testPad', { value: pad });
  });
  await page.setViewportSize({ width: 1700, height: 1050 }); await page.goto('/');
  await expect.poll(() => page.locator('html').getAttribute('data-braze-editor-session')).toBeTruthy();
  const sessionId = await page.locator('html').getAttribute('data-braze-editor-session');
  const call = async (operation: string, data = {}) => {
    const response = await request.post('/api/automation/v1/commands', { headers: { 'X-Braze-Automation': '1' }, data: { version: 1, requestId: crypto.randomUUID(), sessionId, operation, ...data } });
    const body = await response.json(); expect(body.status, JSON.stringify(body)).toBe('ok'); return body.result;
  };
  await expect.poll(async () => (await call('editor.status')).loaded).toBe(true);
  // Native Project import accepts font sources and gives them Asset Database identity.
  await page.locator('input[type=file][accept*=".woff2"]').setInputFiles({ name: 'Menu.ttf', mimeType: 'font/ttf', buffer: await readFile(path.resolve('src/styles/fonts/Roboto-Variable.ttf')) });
  let assets: { guid: string; filename: string }[] = [];
  await expect.poll(async () => { const response = await request.get('/api/assets'); assets = (await response.json()).assets; return assets.some((asset) => asset.filename === 'Menu.ttf'); }).toBe(true);
  const font = assets.find((asset) => asset.filename === 'Menu.ttf')!;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  await page.locator('input[type=file][accept*=".woff2"]').setInputFiles({ name: 'Badge.png', mimeType: 'image/png', buffer: png });
  await expect.poll(async () => { const response = await request.get('/api/assets'); assets = (await response.json()).assets; return assets.some((asset) => asset.filename === 'Badge.png'); }).toBe(true);
  const badge = assets.find((asset) => asset.filename === 'Badge.png')!;
  const inspected = await call('editor.inspect');
  const previous = inspected.items.find((item: { id: string }) => item.id === 'hud').ui_canvas;
  const document = { ...previous, navigation: { enabled: true, initialFocus: 'help', cancel: 'close' }, root: { ...previous.root, style: { ...previous.root.style, font: { guid: font.guid } }, children: [...previous.root.children,
    { id: 'badge', kind: 'image', image: { guid: badge.guid }, label: 'Red badge', style: { position: 'absolute', right: 30, bottom: 30, width: 64, height: 64 } },
  ] } };
  await call('editor.edit', { baseRevision: inspected.revision, apply: true, commands: [{ op: 'component.set', id: 'hud', component: 'uiCanvas', values: document }] });
  await call('editor.select', { objectId: 'hud' });
  const preview = page.locator('.ui-canvas-preview');
  await expect(preview.locator('[data-ui-node=badge]')).toHaveAttribute('data-ui-image', 'ready');
  await expect(preview.locator('[data-ui-node=root]')).toHaveAttribute('data-ui-font', 'ready');
  await preview.locator('[data-ui-node=badge]').click();
  await expect(page.getByLabel('UI element', { exact: true })).toHaveValue('badge');
  await page.getByRole('button', { name: 'Move earlier', exact: true }).click();
  await call('editor.undo'); await call('editor.redo');
  await page.getByRole('button', { name: 'Add breakpoint', exact: true }).click();
  await page.getByLabel('UI width', { exact: true }).fill('128'); await page.getByLabel('UI width', { exact: true }).press('Tab');
  await page.getByLabel('UI preview width', { exact: true }).selectOption('1024');
  await expect(preview.locator('[data-ui-node=badge]')).toHaveCSS('width', '128px');
  await page.getByLabel('UI preview width', { exact: true }).selectOption('320');
  await expect(preview.locator('[data-ui-node=badge]')).toHaveCSS('width', '64px');
  await call('editor.save'); await page.screenshot({ path: info.outputPath('media-layout-editor.png') });
  await page.getByRole('tab', { name: 'Game', exact: true }).click();
  const ui = page.locator('[data-runtime-input-surface] [data-braze-ui]');
  // Refresh keeps the last imported catalog usable; it must not silently reject Play.
  let releaseRefresh!: () => void, refreshStarted!: () => void;
  const heldRefresh = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  const startedRefresh = new Promise<void>((resolve) => { refreshStarted = resolve; });
  await page.route('**/api/assets', async (route) => { refreshStarted(); await heldRefresh; await route.continue(); });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('braze:asset-database-changed'))); await startedRefresh;
    await call('editor.transport', { action: 'play' });
    await expect(ui.locator('[data-ui-node=root]')).toHaveAttribute('data-ui-font', 'ready');
    await expect(ui.locator('[data-ui-node=badge]')).toHaveAttribute('data-ui-image', 'ready');
  } finally { releaseRefresh(); await page.unrouteAll({ behavior: 'wait' }); }
  const pad = async (index: number, pressed: boolean) => page.evaluate(({ index, pressed }) => {
    const item = (window as unknown as { __testPad: { buttons: { value: number; pressed: boolean }[] } }).__testPad.buttons[index]; item.value = Number(pressed); item.pressed = pressed;
  }, { index, pressed });
  // Gamepads are sampled on fixed ticks. A short wall-clock pulse can fall
  // entirely between ticks during shader warmup and never reach navigation.
  const sampled = async () => {
    const before = (await call('editor.status')).physics?.submittedStepId ?? 0;
    await expect.poll(async () => (await call('editor.status')).physics?.submittedStepId ?? 0).toBeGreaterThan(before + 1);
  };
  const press = async (index: number) => { await pad(index, true); await sampled(); await pad(index, false); await sampled(); };
  await page.bringToFront(); await page.locator('[data-runtime-input-surface]').focus(); await sampled();
  await press(13); await expect(ui.getByRole('button', { name: 'How to play' })).toBeFocused();
  await press(0); await expect(ui.getByText('Your next discovery', { exact: true })).toBeVisible();
  await expect(ui.getByText('0 points', { exact: true })).toBeVisible();
  const observed = await call('editor.ui'); expect(observed.presentation.resources.some((item: { font?: string }) => item.font === 'ready')).toBe(true);
  await press(1); await expect(ui.getByText('Your next discovery', { exact: true })).toBeHidden();
  await call('editor.transport', { action: 'pause' }); await pad(0, true); await call('editor.transport', { action: 'play' }); await sampled();
  await expect(ui.getByText('Your next discovery', { exact: true })).toBeHidden(); await pad(0, false);
  await page.screenshot({ path: info.outputPath('media-gamepad-play.png') });
  await call('editor.transport', { action: 'stop' }); await expect(ui).toHaveCount(0);
  await call('editor.transport', { action: 'play' }); await expect(ui.locator('[data-ui-node=root]')).toHaveAttribute('data-ui-font', 'ready');
  await call('editor.transport', { action: 'stop' });
  // Leave the shared starter fixture as found for the other acceptance specs.
  const restore = await call('editor.inspect'); await call('editor.edit', { baseRevision: restore.revision, apply: true, commands: [{ op: 'component.set', id: 'hud', component: 'uiCanvas', values: previous }] }); await call('editor.save');
  expect(errors).toEqual([]);
});
