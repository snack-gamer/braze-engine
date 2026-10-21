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
  localStorage.removeItem('tgan.materialTileSize');
  localStorage.removeItem('tgan.assetsViewMode');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.workspace', { timeout: 8000 });
await page.waitForTimeout(1500);

// Default tile size is 88, which is >= PREVIEW_THRESHOLD (72) → previews
// should render. Wait for the offscreen Three.js work to finish (serialized,
// model loading + parse is several seconds per asset).
console.log('waiting for previews to render...');
await page.waitForFunction(() => {
  const tiles = document.querySelectorAll('.asset-tile.model-tile, .asset-tile.hdri-tile').length;
  const previews = document.querySelectorAll('.asset-tile__preview').length;
  return tiles > 0 && previews >= tiles;
}, { timeout: 30000 }).catch(() => console.log('preview render timed out'));

const totalModelTiles = await page.locator('.asset-tile.model-tile').count();
const totalHdriTiles = await page.locator('.asset-tile.hdri-tile').count();
const modelPreviewImgs = await page.locator('.asset-tile.model-tile .asset-tile__preview').count();
const hdriPreviewImgs = await page.locator('.asset-tile.hdri-tile .asset-tile__preview').count();
console.log(`models: ${totalModelTiles} tiles, ${modelPreviewImgs} with previews`);
console.log(`hdris:  ${totalHdriTiles} tiles, ${hdriPreviewImgs} with previews`);
await page.screenshot({ path: '/tmp/tgan_previews_default.png' });

// Shrink tiles all the way down via the range slider — previews should
// disappear, icons return. (Clicking the +/- button is racey when
// background renders are still happening.)
await page.evaluate(() => {
  const slider = document.querySelector('.assets__zoom input[type="range"]');
  if (!slider) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(slider, '56');
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  slider.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(300);
const tileSize = await page.evaluate(() => {
  const el = document.querySelector('.assets');
  return el && getComputedStyle(el).getPropertyValue('--tile-size');
});
const previewImgsAfterShrink = await page.locator('.asset-tile__preview').count();
const iconsAfterShrink = await page.locator('.model-tile__icon svg, .hdri-tile__swatch svg').count();
console.log(`after shrink to min: tileSize=${tileSize?.trim()}, ${previewImgsAfterShrink} previews visible, ${iconsAfterShrink} fallback icons`);
await page.screenshot({ path: '/tmp/tgan_previews_min.png' });

// Zoom back up via the slider — previews should reappear (cached).
await page.evaluate(() => {
  const slider = document.querySelector('.assets__zoom input[type="range"]');
  if (!slider) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(slider, '120');
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  slider.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(400);
const previewImgsAfterGrow = await page.locator('.asset-tile__preview').count();
console.log(`after zoom back up: ${previewImgsAfterGrow} previews visible`);
await page.screenshot({ path: '/tmp/tgan_previews_max.png' });

// List view: previews are NOT rendered (gated by viewMode === "grid").
const listBtn = page.locator('.assets__view-toggle button').nth(1);
await listBtn.click();
await page.waitForTimeout(400);
const previewImgsInList = await page.locator('.asset-tile__preview').count();
console.log(`list view: ${previewImgsInList} previews visible (should be 0)`);
await page.screenshot({ path: '/tmp/tgan_previews_list.png' });

console.log('console errors:', consoleErrors.slice(0, 5));
await browser.close();
