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

// 1) AssetBrowser present, LeftRail no longer has a Library section.
const browserExists = await page.locator('.assets').count();
const librarySection = await page.locator('.rail-section:has-text("Library")').count();
console.log('asset browser count:', browserExists, '· library section in left rail (should be 0):', librarySection);

// 2) Tabs: 3 tabs visible.
const tabLabels = await page.$$eval('.asset-tabs__tab', els => els.map(e => e.textContent.trim()));
console.log('tabs:', tabLabels);

// 3) Click Models tab.
await page.locator('.asset-tabs__tab', { hasText: 'Models' }).click();
await page.waitForTimeout(200);
const modelTiles = await page.locator('.asset-tile.model-tile').count();
const modelEmpty = await page.locator('.assets__empty').count();
console.log('model tiles:', modelTiles, '· empty msg:', modelEmpty);
await page.screenshot({ path: '/tmp/tgan_phase2_models_tab.png' });

// 4) Click HDRIs tab.
await page.locator('.asset-tabs__tab', { hasText: 'HDRIs' }).click();
await page.waitForTimeout(200);
const hdriTiles = await page.locator('.asset-tile.hdri-tile').count();
console.log('hdri tiles:', hdriTiles);
await page.screenshot({ path: '/tmp/tgan_phase2_hdris_tab.png' });

// 5) Click an HDRI tile — should mark it active (assigned class) and change environment.
if (hdriTiles > 0) {
  const second = page.locator('.asset-tile.hdri-tile').nth(Math.min(1, hdriTiles - 1));
  await second.click();
  await page.waitForTimeout(300);
  const assignedCount = await page.locator('.asset-tile.hdri-tile.assigned').count();
  console.log('hdri assigned class count after click:', assignedCount);
}

// 6) Back to Materials tab + verify tile count still works.
await page.locator('.asset-tabs__tab', { hasText: 'Materials' }).click();
await page.waitForTimeout(200);
const matsBefore = await page.locator('.asset-tile').count();
await page.locator('.assets__create').click();
await page.waitForTimeout(150);
const matsAfter = await page.locator('.asset-tile').count();
console.log('material tiles before/after create:', matsBefore, '→', matsAfter);

await page.screenshot({ path: '/tmp/tgan_phase2_materials_tab.png' });
console.log('console errors:', consoleErrors);
await browser.close();
