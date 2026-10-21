import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });

const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push('console.error: ' + msg.text()); });

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.removeItem('tgan.folders');
  localStorage.removeItem('tgan.itemFolders');
  localStorage.removeItem('tgan.itemNames');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.workspace', { timeout: 8000 });
await page.waitForTimeout(1500);

// Right-click a model tile.
const firstModel = page.locator('.asset-tile.model-tile').first();
const originalModelName = (await firstModel.locator('.asset-tile__name').textContent())?.trim();
await firstModel.click({ button: 'right' });
await page.waitForTimeout(150);
const modelMenu = await page.$$eval('.hier-menu .hier-menu__item', els => els.map(e => e.textContent.trim()));
console.log('model menu items:', modelMenu);

// Click Rename and type a new name.
await page.locator('.hier-menu__item', { hasText: 'Rename' }).click();
await page.waitForTimeout(200);
const editing = await page.locator('.asset-tile--editing').count();
console.log('inline edit tile present:', editing);
await page.keyboard.type('Hero Crate');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
const renamedModel = await page.locator('.asset-tile.model-tile .asset-tile__name', { hasText: 'Hero Crate' }).count();
console.log(`model renamed "${originalModelName}" → "Hero Crate":`, renamedModel === 1);

// Right-click an HDRI and rename via F2.
const firstHdri = page.locator('.asset-tile.hdri-tile').first();
const originalHdriName = (await firstHdri.locator('.asset-tile__name').textContent())?.trim();
await firstHdri.click();
await page.waitForTimeout(150);
const hdriMenuBefore = await page.locator('.asset-tile.hdri-tile').first().click({ button: 'right' });
await page.waitForTimeout(150);
const hdriMenu = await page.$$eval('.hier-menu .hier-menu__item', els => els.map(e => e.textContent.trim()));
console.log('hdri menu items:', hdriMenu);
await page.keyboard.press('Escape');
await page.waitForTimeout(100);

// Re-select HDRI and use F2.
await firstHdri.click();
await page.waitForTimeout(100);
await page.keyboard.press('F2');
await page.waitForTimeout(200);
const editingHdri = await page.locator('.asset-tile--editing').count();
console.log('F2 inline edit present on HDRI:', editingHdri);
await page.keyboard.type('Golden Hour Sky');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
const renamedHdri = await page.locator('.asset-tile.hdri-tile .asset-tile__name', { hasText: 'Golden Hour Sky' }).count();
console.log(`hdri renamed "${originalHdriName}" → "Golden Hour Sky":`, renamedHdri === 1);

// Reload — names should persist.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.workspace', { timeout: 8000 });
await page.waitForTimeout(1200);
const persistedModel = await page.locator('.asset-tile.model-tile .asset-tile__name', { hasText: 'Hero Crate' }).count();
const persistedHdri = await page.locator('.asset-tile.hdri-tile .asset-tile__name', { hasText: 'Golden Hour Sky' }).count();
console.log('persisted across reload — model:', persistedModel === 1, '· hdri:', persistedHdri === 1);

// Search by display name.
await page.locator('.assets__search input').fill('Hero');
await page.waitForTimeout(200);
const heroVisible = await page.locator('.asset-tile.model-tile .asset-tile__name', { hasText: 'Hero Crate' }).count();
const otherVisible = await page.locator('.asset-tile.hdri-tile').count();
console.log('search "Hero" matches renamed model:', heroVisible === 1, '· hides hdris:', otherVisible === 0);

await page.screenshot({ path: '/tmp/tgan_rename_all.png' });
console.log('console errors:', consoleErrors);
await browser.close();
