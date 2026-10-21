import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });

const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push('console.error: ' + msg.text());
});

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.removeItem('tgan.folders');
  localStorage.removeItem('tgan.itemFolders');
  localStorage.removeItem('tgan.assetsViewMode');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.workspace', { timeout: 8000 });
await page.waitForTimeout(1500);

// Right-click empty → New Folder. Should show inline input, NOT a chrome prompt.
const tiles = page.locator('.assets__tiles');
const tilesBox = await tiles.boundingBox();
await page.mouse.click(tilesBox.x + tilesBox.width - 30, tilesBox.y + tilesBox.height - 30, { button: 'right' });
await page.waitForTimeout(150);

let dialogFired = false;
page.on('dialog', async (d) => { dialogFired = true; await d.dismiss(); });

await page.locator('.hier-menu__item', { hasText: 'New Folder' }).click();
await page.waitForTimeout(200);
const editTile = await page.locator('.folder-tile--editing').count();
const inputFocused = await page.evaluate(() => document.activeElement?.classList.contains('folder-tile__name-input'));
console.log('inline edit tile present:', editTile, '· input focused:', inputFocused, '· dialog fired (should be false):', dialogFired);

// Type "props" + Enter.
await page.keyboard.type('props');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
const folderCount = await page.locator('.asset-tile.folder-tile:not(.folder-tile--editing)').count();
console.log('folder tiles after Enter commit:', folderCount);
await page.screenshot({ path: '/tmp/tgan_phase3b_inline_create.png' });

// Right-click the folder → Rename, type "products", Enter.
await page.locator('.asset-tile.folder-tile', { hasText: 'props' }).click({ button: 'right' });
await page.waitForTimeout(150);
await page.locator('.hier-menu__item', { hasText: 'Rename' }).click();
await page.waitForTimeout(200);
const renameEditCount = await page.locator('.folder-tile--editing').count();
console.log('rename edit tile present:', renameEditCount);
// Inline input has initial value selected — typing replaces it.
await page.keyboard.type('products');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
const renamedFolderText = await page.locator('.asset-tile.folder-tile').first().textContent();
console.log('folder name after rename:', renamedFolderText?.trim());

// Escape cancels.
await page.mouse.click(tilesBox.x + tilesBox.width - 30, tilesBox.y + tilesBox.height - 30, { button: 'right' });
await page.waitForTimeout(150);
await page.locator('.hier-menu__item', { hasText: 'New Folder' }).click();
await page.waitForTimeout(200);
await page.keyboard.type('throwaway');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const folderCountAfterEsc = await page.locator('.asset-tile.folder-tile:not(.folder-tile--editing)').count();
console.log('folder count after Esc cancel (should still be 1):', folderCountAfterEsc);

// Toggle to list view.
const listBtn = page.locator('.assets__view-toggle button').nth(1);
await listBtn.click();
await page.waitForTimeout(200);
const tilesIsList = await page.evaluate(() => document.querySelector('.assets__tiles')?.classList.contains('list'));
const computedDisplay = await page.evaluate(() =>
  getComputedStyle(document.querySelector('.assets__tiles')).flexDirection
);
console.log('list-mode active:', tilesIsList, '· flex-direction:', computedDisplay);
await page.screenshot({ path: '/tmp/tgan_phase3b_list_view.png' });

// Toggle back to grid.
const gridBtn = page.locator('.assets__view-toggle button').nth(0);
await gridBtn.click();
await page.waitForTimeout(200);
const tilesIsGrid = await page.evaluate(() => !document.querySelector('.assets__tiles')?.classList.contains('list'));
console.log('grid mode active after toggle back:', tilesIsGrid);
await page.screenshot({ path: '/tmp/tgan_phase3b_grid_view.png' });

console.log('console errors:', consoleErrors);
await browser.close();
