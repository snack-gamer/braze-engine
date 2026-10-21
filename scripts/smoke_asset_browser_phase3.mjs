import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });

const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push('console.error: ' + msg.text());
});

// Clear localStorage so we start from a known folder state.
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.removeItem('tgan.folders');
  localStorage.removeItem('tgan.itemFolders');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.workspace', { timeout: 8000 });
await page.waitForTimeout(1500);

// 1) Tabs gone, breadcrumb shows "Assets".
const tabsCount = await page.locator('.asset-tabs').count();
const crumbs = await page.$$eval('.assets__crumb', els => els.map(e => e.textContent.trim()));
console.log('tabs (should be 0):', tabsCount, 'crumbs at root:', crumbs);

// 2) All assets visible in one view: models + hdris at root.
const modelCount = await page.locator('.asset-tile.model-tile').count();
const hdriCount = await page.locator('.asset-tile.hdri-tile').count();
console.log('models at root:', modelCount, 'hdris at root:', hdriCount);
await page.screenshot({ path: '/tmp/tgan_phase3_root.png' });

// 3) Right-click empty area → context menu pops up.
const tiles = page.locator('.assets__tiles');
const tilesBox = await tiles.boundingBox();
await page.mouse.move(tilesBox.x + tilesBox.width - 30, tilesBox.y + tilesBox.height - 30);
await page.mouse.click(tilesBox.x + tilesBox.width - 30, tilesBox.y + tilesBox.height - 30, { button: 'right' });
await page.waitForTimeout(200);
const menuVisible = await page.locator('.hier-menu').count();
const menuItems = await page.$$eval('.hier-menu .hier-menu__item', els => els.map(e => e.textContent.trim()));
console.log('context menu visible:', menuVisible, 'items:', menuItems);
await page.screenshot({ path: '/tmp/tgan_phase3_menu.png' });

// 4) Create a folder named "props" via the prompt.
page.once('dialog', async (dialog) => {
  console.log('prompt:', dialog.message());
  await dialog.accept('props');
});
await page.locator('.hier-menu__item', { hasText: 'New Folder' }).click();
await page.waitForTimeout(200);
const folderTiles = await page.locator('.asset-tile.folder-tile').count();
console.log('folder tiles after create:', folderTiles);

// 5) Create another folder "outdoor".
await page.mouse.click(tilesBox.x + tilesBox.width - 30, tilesBox.y + tilesBox.height - 30, { button: 'right' });
await page.waitForTimeout(150);
page.once('dialog', async (d) => { await d.accept('outdoor'); });
await page.locator('.hier-menu__item', { hasText: 'New Folder' }).click();
await page.waitForTimeout(200);
const folders2 = await page.locator('.asset-tile.folder-tile').count();
console.log('folder tiles after second create:', folders2);
await page.screenshot({ path: '/tmp/tgan_phase3_folders.png' });

// 6) Double-click "props" to navigate in.
await page.locator('.asset-tile.folder-tile', { hasText: 'props' }).dblclick();
await page.waitForTimeout(200);
const crumbsInProps = await page.$$eval('.assets__crumb', els => els.map(e => e.textContent.trim()));
console.log('crumbs in props:', crumbsInProps);
const emptyInProps = await page.locator('.assets__empty').count();
console.log('empty message in props:', emptyInProps);

// 7) Inside "props", right-click → New Folder "wood" (nested).
const tilesBox2 = await tiles.boundingBox();
await page.mouse.click(tilesBox2.x + tilesBox2.width - 30, tilesBox2.y + tilesBox2.height - 30, { button: 'right' });
await page.waitForTimeout(150);
page.once('dialog', async (d) => { await d.accept('wood'); });
await page.locator('.hier-menu__item', { hasText: 'New Folder' }).click();
await page.waitForTimeout(200);
const nestedFolderCount = await page.locator('.asset-tile.folder-tile').count();
console.log('nested folder tiles (wood inside props):', nestedFolderCount);

// 8) Navigate via breadcrumb back to Assets.
await page.locator('.assets__crumb', { hasText: 'Assets' }).first().click();
await page.waitForTimeout(150);
const backAtRoot = await page.$$eval('.assets__crumb', els => els.map(e => e.textContent.trim()));
console.log('crumbs after clicking Assets:', backAtRoot);
const rootFolders = await page.locator('.asset-tile.folder-tile').count();
console.log('folders visible at root:', rootFolders);

// 9) Create new material via top-right Create button (uses same menu).
page.once('dialog', async (d) => {
  // Sanity: shouldn't trigger a prompt for new material.
  console.log('unexpected dialog:', d.message());
  await d.dismiss();
});
await page.locator('.assets__create').click();
await page.waitForTimeout(150);
await page.locator('.hier-menu__item', { hasText: 'New Material' }).click();
await page.waitForTimeout(200);
const matsCount = await page.locator('.asset-tile').filter({ hasNot: page.locator('.folder-tile, .model-tile, .hdri-tile') }).count();
console.log('material tiles at root:', matsCount);
await page.screenshot({ path: '/tmp/tgan_phase3_final.png' });

// 10) Right-click a folder for its menu.
await page.locator('.asset-tile.folder-tile', { hasText: 'outdoor' }).click({ button: 'right' });
await page.waitForTimeout(200);
const folderMenuItems = await page.$$eval('.hier-menu .hier-menu__item', els => els.map(e => e.textContent.trim()));
console.log('folder menu items:', folderMenuItems);

console.log('console errors:', consoleErrors);
await browser.close();
