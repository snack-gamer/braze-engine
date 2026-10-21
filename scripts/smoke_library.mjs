import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
});

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.three-host canvas', { timeout: 8000 });
await page.waitForTimeout(1200);

// Library should be visible
const libraryRows = await page.$$('.library-row');
console.log('library rows:', libraryRows.length);

// Click first asset to add to scene
if (libraryRows.length > 0) {
  const beforeAdd = await page.$$eval('.object-row', (rows) => rows.length);
  await libraryRows[0].click();
  await page.waitForTimeout(1500);
  const afterAdd = await page.$$eval('.object-row', (rows) => rows.length);
  console.log('objects before/after click-add:', beforeAdd, '/', afterAdd);
}

await page.screenshot({ path: '/tmp/tgan_library.png', fullPage: false });

// Wait for autosave (debounce 600ms + buffer)
await page.waitForTimeout(1500);

const sceneJson = await page.evaluate(() =>
  fetch('/api/scenes/current').then((r) => r.json()),
);
console.log('saved scene objects:', sceneJson?.scene?.objects?.length ?? 'null');

const filtered = errors.filter((e) => !e.includes('WebSocket'));
console.log('errors:', filtered.length);
if (filtered.length) console.log(JSON.stringify(filtered, null, 2));

await browser.close();
console.log('---');
console.log('3d-models/ contents:');
console.log(readdirSync(fileURLToPath(new URL('../3d-models/', import.meta.url))).join('\n'));
