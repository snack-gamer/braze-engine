import { chromium } from 'playwright';
import { writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const tmpFile = '/tmp/tgan_test_ship.glb';
writeFileSync(tmpFile, Buffer.from('glTF-stub-bytes'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
});

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.three-host canvas', { timeout: 8000 });
await page.waitForTimeout(800);

const before = await page.$$eval('.object-row', (rows) => rows.length);
console.log('objects before import:', before);

const input = await page.$('input[type="file"][accept*=".glb"]');
await input.setInputFiles(tmpFile);
await page.waitForTimeout(2000);

const after = await page.$$eval('.object-row', (rows) => rows.length);
console.log('objects after import:', after);

const note = await page.$eval('.info-card', (el) => el.textContent).catch(() => '(no info-card)');
console.log('asset note:', note);

const filtered = errors.filter((e) => !e.includes('WebSocket'));
console.log('errors:', filtered.length);
if (filtered.length) console.log(JSON.stringify(filtered, null, 2));

unlinkSync(tmpFile);
await browser.close();

console.log('---');
console.log('3d-models/ contents:');
console.log(readdirSync(fileURLToPath(new URL('../3d-models/', import.meta.url))).join('\n'));
