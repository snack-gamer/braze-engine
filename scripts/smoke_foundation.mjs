import { chromium } from 'playwright';
import { writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const tmpFile = '/tmp/tgan_foundation_test.glb';
writeFileSync(tmpFile, Buffer.from('glTF-stub'));

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

const initial = await page.$$eval('.object-row', (rows) => rows.length);
console.log('initial objects:', initial);

// Add cube (history + adds)
await page.click('.add-tile:has-text("Cube")');
await page.waitForTimeout(200);

// Switch active object several times — this used to thrash; verify it's smooth
const rows = await page.$$('.object-row');
for (const row of rows) {
  await row.click();
  await page.waitForTimeout(80);
}
console.log('selected each object — no thrash expected');

// Cmd+D to duplicate the active object
await page.keyboard.press('Meta+d');
await page.waitForTimeout(200);
const afterDup = await page.$$eval('.object-row', (rows) => rows.length);
console.log('after Cmd+D:', afterDup);

// Delete the duplicate
await page.keyboard.press('Delete');
await page.waitForTimeout(200);
const afterDelete = await page.$$eval('.object-row', (rows) => rows.length);
console.log('after Delete:', afterDelete);

// Import a fake GLB
const input = await page.$('input[type="file"][accept*=".glb"]');
await input.setInputFiles(tmpFile);
await page.waitForTimeout(2000);
const afterImport = await page.$$eval('.object-row', (rows) => rows.length);
console.log('after import:', afterImport);

// Material section should appear in inspector (we have an imported mesh selected)
const materialHeader = await page.$('text=Material');
console.log('material section visible:', !!materialHeader);

// Toggle viewModes — loaded model should remain (silhouette via material override)
for (const mode of ['semantic', 'depth', 'mask', 'solid']) {
  await page.click(`.floating-overlay.bottom-left .overlay-pill button:has-text("${mode}")`);
  await page.waitForTimeout(150);
}
console.log('viewMode cycle complete');

await page.screenshot({ path: '/tmp/tgan_foundation_after.png', fullPage: false });

const filtered = errors.filter((e) => !e.includes('WebSocket'));
console.log('errors:', filtered.length);
if (filtered.length) console.log(JSON.stringify(filtered, null, 2));

unlinkSync(tmpFile);
// Clean up uploaded test asset
const assetDir = fileURLToPath(new URL('../3d-models/', import.meta.url));
for (const f of readdirSync(assetDir)) {
  if (f.startsWith('tgan_foundation_test-')) unlinkSync(assetDir + f);
}

await browser.close();
