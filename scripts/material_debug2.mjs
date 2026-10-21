import { chromium } from 'playwright';
import { writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DUCK = '/tmp/tgan_duck.glb';
if (!existsSync(DUCK)) {
  const r = await fetch('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Duck/glTF-Binary/Duck.glb');
  writeFileSync(DUCK, Buffer.from(await r.arrayBuffer()));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
page.on('pageerror', m => console.log('[err]', m.message));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.three-host canvas');
await page.waitForTimeout(800);

// Start fresh: clear scene by reloading without scene? Actually just upload duck
const input = await page.$('input[type="file"][accept*=".glb"]');
await input.setInputFiles(DUCK);
await page.waitForTimeout(3500);

// Click on the duck row in the tree (last item)
const treeRows = await page.$$('[class*="hierarchy"] [class*="row"], .object-row, [data-object-id]');
console.log('tree row count:', treeRows.length);

// Try a different selector — find the row containing "tgan_duck"
const duckRow = await page.$('text=/tgan_duck/');
if (duckRow) {
  await duckRow.click();
  await page.waitForTimeout(300);
}

// Now sample. Move camera to focus on duck with F key
await page.keyboard.press('f');
await page.waitForTimeout(800);

const sample = async () => await page.evaluate(() => {
  const c = document.querySelector('.three-host canvas');
  const off = document.createElement('canvas');
  off.width = c.width; off.height = c.height;
  off.getContext('2d').drawImage(c, 0, 0);
  // 3x3 sample around center
  const w = c.width, h = c.height;
  const ctx = off.getContext('2d');
  const pixels = [];
  for (let dy = -10; dy <= 10; dy += 5) {
    for (let dx = -10; dx <= 10; dx += 5) {
      const px = ctx.getImageData(w/2 + dx, h/2 + dy, 1, 1).data;
      pixels.push([px[0], px[1], px[2]]);
    }
  }
  return pixels;
});

const heading = await page.$eval('.rail-heading', el => el.textContent).catch(()=>null);
console.log('Active object heading:', heading);

const isFocusedDuck = await page.evaluate(() => {
  const hd = document.querySelectorAll('.rail-heading');
  return Array.from(hd).map(h => h.textContent).slice(0, 4);
});
console.log('Headings:', isFocusedDuck);

await page.screenshot({ path: '/tmp/m2_before.png' });
const before = await sample();

// Find material toggle and click
const toggle = await page.$('.material-toggle input[type="checkbox"]');
console.log('material toggle present:', !!toggle);
if (!toggle) {
  console.log('NO MATERIAL TOGGLE — material section not rendered for active object');
  await browser.close();
  process.exit(0);
}
await toggle.click();
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/m2_override_on.png' });
const afterToggle = await sample();

// Apply emissive preset (bright cyan, intensity 1.25)
const selects = await page.$$('select');
for (const s of selects) {
  const opts = await s.evaluate(el => Array.from(el.options).map(o => o.value));
  if (opts.includes('emissive')) {
    await s.selectOption('emissive');
    break;
  }
}
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/m2_emissive.png' });
const afterEmissive = await sample();

console.log('before center pixels:', JSON.stringify(before));
console.log('afterToggle center pixels:', JSON.stringify(afterToggle));
console.log('afterEmissive center pixels:', JSON.stringify(afterEmissive));

await browser.close();

const assetDir = fileURLToPath(new URL('../3d-models/', import.meta.url));
for (const f of readdirSync(assetDir)) {
  if (f.startsWith('tgan_duck-')) {
    try { unlinkSync(assetDir + f); } catch {}
  }
}
