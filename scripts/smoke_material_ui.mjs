import { chromium } from 'playwright';
import { writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Fetch the canonical Duck.glb so we have a real model to test
const duckPath = '/tmp/tgan_duck.glb';
const duckResp = await fetch('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Duck/glTF-Binary/Duck.glb');
const duckBuf = Buffer.from(await duckResp.arrayBuffer());
writeFileSync(duckPath, duckBuf);
console.log('downloaded Duck.glb, bytes:', duckBuf.length);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.three-host canvas', { timeout: 8000 });
await page.waitForTimeout(1000);

const input = await page.$('input[type="file"][accept*=".glb"]');
await input.setInputFiles(duckPath);
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/tgan_duck_loaded.png', fullPage: false });

// Material section should be visible — try toggling the override
const overrideToggle = await page.$('.material-toggle input[type="checkbox"]');
if (overrideToggle) {
  await overrideToggle.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/tgan_material_override.png', fullPage: false });
}

unlinkSync(duckPath);
const assetDir = fileURLToPath(new URL('../3d-models/', import.meta.url));
for (const f of readdirSync(assetDir)) {
  if (f.startsWith('tgan_duck-')) unlinkSync(assetDir + f);
}
console.log('OK');
await browser.close();
