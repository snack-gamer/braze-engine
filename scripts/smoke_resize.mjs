import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.workspace', { timeout: 8000 });
await page.waitForTimeout(800);

const readWidth = async (varname) =>
  page.evaluate((v) => getComputedStyle(document.querySelector('.workspace')).getPropertyValue(v).trim(), varname);

const initialAssets = await readWidth('--assets-w');
const initialRail = await readWidth('--rail-l');
console.log('initial:  --assets-w=' + initialAssets + ', --rail-l=' + initialRail);

// Drag the LeftRail's resize handle. It lives inside .rail-left and sits
// on the right edge. We grab it and move ±40px from its current position.
const railHandle = page.locator('.rail-left .rail-resize-handle');
const railBox = await railHandle.boundingBox();
console.log('rail handle at x=' + railBox.x.toFixed(0) + ' (rail right edge)');

// Small drag right by 40px → rail should grow by ~40, NOT jump to 460+.
await page.mouse.move(railBox.x + 2, railBox.y + 60);
await page.mouse.down();
await page.mouse.move(railBox.x + 42, railBox.y + 60, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(150);

const afterRight = await readWidth('--rail-l');
console.log('after  +40px drag: --rail-l=' + afterRight);

// Drag back to the LEFT by 40px → should shrink back toward original.
const railHandle2Box = await page.locator('.rail-left .rail-resize-handle').boundingBox();
await page.mouse.move(railHandle2Box.x + 2, railHandle2Box.y + 60);
await page.mouse.down();
await page.mouse.move(railHandle2Box.x - 38, railHandle2Box.y + 60, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(150);
const afterLeft = await readWidth('--rail-l');
console.log('after  -40px drag: --rail-l=' + afterLeft);

// Same test for AssetBrowser handle.
const assetsHandle = page.locator('.assets .rail-resize-handle');
const assetsBox = await assetsHandle.boundingBox();
console.log('assets handle at x=' + assetsBox.x.toFixed(0));
await page.mouse.move(assetsBox.x + 2, assetsBox.y + 60);
await page.mouse.down();
await page.mouse.move(assetsBox.x + 40, assetsBox.y + 60, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(150);
const assetsAfter = await readWidth('--assets-w');
console.log('after  +40px drag on assets: --assets-w=' + assetsAfter);

await browser.close();
