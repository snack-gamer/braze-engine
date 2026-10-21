import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });

const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push('console.error: ' + msg.text());
});

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.workspace', { timeout: 8000 });
await page.waitForTimeout(1800);

// 1) AssetBrowser should be present in the workspace as the FIRST column.
const browserExists = await page.locator('.assets').count();
console.log('asset browser count:', browserExists);

// 2) Bottom materials-panel should be GONE.
const oldPanel = await page.locator('.materials-panel').count();
console.log('old materials-panel count (should be 0):', oldPanel);

// 3) Order in workspace: .assets then .rail-left then .stage then .rail-right
const workspaceChildren = await page.$$eval('.workspace > *', els =>
  els.map(el => el.className.split(/\s+/).filter(Boolean).join('.'))
);
console.log('workspace children in order:', workspaceChildren);

// 4) Search box + tab + create button
const hasSearch = await page.locator('.assets__search input').count();
const hasTab = await page.locator('.asset-tabs__tab.active').count();
const createBtn = await page.locator('.assets__create').count();
console.log('search count:', hasSearch, 'active tab count:', hasTab, 'create btn count:', createBtn);

// Take a baseline screenshot.
await page.screenshot({ path: '/tmp/tgan_asset_browser_initial.png', fullPage: false });

// 5) Click +New twice to create 2 materials, screenshot.
await page.locator('.assets__create').click();
await page.waitForTimeout(150);
await page.locator('.assets__create').click();
await page.waitForTimeout(200);
const tileCount = await page.locator('.asset-tile').count();
console.log('tile count after creating 2:', tileCount);
await page.screenshot({ path: '/tmp/tgan_asset_browser_two_tiles.png', fullPage: false });

// 6) Type into search — should filter.
await page.locator('.assets__search input').fill('zzzz_nomatch');
await page.waitForTimeout(150);
const visibleAfterSearch = await page.locator('.asset-tile').count();
const emptyMsg = await page.locator('.assets__empty').count();
console.log('tiles after no-match search:', visibleAfterSearch, 'empty msg count:', emptyMsg);

await page.locator('.assets__search input').fill('');
await page.waitForTimeout(150);

// 7) Drag a tile onto a hierarchy row should set materialId — check chip appears.
const firstTile = page.locator('.asset-tile').first();
const firstRow = page.locator('.object-row').first();

// Use bounding box drag (Playwright doesn't natively support HTML5 dnd via .dragTo
// across stop-propagation handlers; use mouse moves with dataTransfer simulation).
await firstTile.evaluate((el) => {
  el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
});
// Easier: doubleclick to assign to active object.
await firstTile.dblclick();
await page.waitForTimeout(200);
const chips = await page.locator('.material-chip').count();
console.log('material chips on hierarchy after doubleclick:', chips);

await page.screenshot({ path: '/tmp/tgan_asset_browser_chip.png', fullPage: false });

// 8) Resize handle present — drag it right by 40px.
const handle = await page.locator('.assets .rail-resize-handle');
const handleBox = await handle.boundingBox();
if (handleBox) {
  await page.mouse.move(handleBox.x + 2, handleBox.y + 50);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 60, handleBox.y + 50, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}
const widthVar = await page.evaluate(() => {
  const w = document.querySelector('.workspace');
  return getComputedStyle(w).getPropertyValue('--assets-w');
});
console.log('--assets-w after resize:', widthVar.trim());

await page.screenshot({ path: '/tmp/tgan_asset_browser_resized.png', fullPage: false });

console.log('console errors:', consoleErrors);
await browser.close();
