import { chromium } from 'playwright';
import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DUCK = '/tmp/tgan_duck.glb';
if (!existsSync(DUCK)) {
  const r = await fetch('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Duck/glTF-Binary/Duck.glb');
  writeFileSync(DUCK, Buffer.from(await r.arrayBuffer()));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', m => logs.push(`[error] ${m.message}`));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.three-host canvas');
await page.waitForTimeout(1000);

const input = await page.$('input[type="file"][accept*=".glb"]');
await input.setInputFiles(DUCK);
await page.waitForTimeout(3500);

// Get the canvas and sample center pixel before override
const sample = async () => await page.evaluate(() => {
  const c = document.querySelector('.three-host canvas');
  const off = document.createElement('canvas');
  off.width = c.width; off.height = c.height;
  off.getContext('2d').drawImage(c, 0, 0);
  const px = off.getContext('2d').getImageData(c.width/2, c.height/2, 1, 1).data;
  return [px[0], px[1], px[2]];
});

await page.screenshot({ path: '/tmp/m_before.png' });
const before = await sample();

// Find and click override toggle
const toggle = await page.$('.material-toggle input[type="checkbox"]');
const toggleExists = !!toggle;
if (toggle) await toggle.click();
await page.waitForTimeout(800);

await page.screenshot({ path: '/tmp/m_override_on.png' });
const afterToggle = await sample();

// Find and click "Metal" preset
const select = await page.$('.rail-section select');
let presetApplied = false;
if (select) {
  // Find the material preset select specifically
  const selects = await page.$$('select');
  for (const s of selects) {
    const opts = await s.evaluate(el => Array.from(el.options).map(o => o.value));
    if (opts.includes('metal')) {
      await s.selectOption('metal');
      presetApplied = true;
      break;
    }
  }
}
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/m_metal.png' });
const afterMetal = await sample();

// Try emissive bright preset for more visual difference
const selects = await page.$$('select');
for (const s of selects) {
  const opts = await s.evaluate(el => Array.from(el.options).map(o => o.value));
  if (opts.includes('emissive')) {
    await s.selectOption('emissive');
    break;
  }
}
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/m_emissive.png' });
const afterEmissive = await sample();

// Also inspect React state via window if exposed — get the activeObject material via DOM
const overrideState = await page.evaluate(() => {
  const cb = document.querySelector('.material-toggle input[type="checkbox"]');
  const sliders = Array.from(document.querySelectorAll('.rail-section input[type="range"]'));
  return {
    enabled: cb?.checked,
    sliderValues: sliders.map(s => ({ aria: s.getAttribute('aria-label'), value: s.value })),
  };
});

console.log(JSON.stringify({ toggleExists, presetApplied, before, afterToggle, afterMetal, afterEmissive, overrideState }, null, 2));
console.log('--- console ---');
for (const l of logs) console.log(l);
await browser.close();

// Clean up uploaded asset
const assetDir = fileURLToPath(new URL('../3d-models/', import.meta.url));
for (const f of readdirSync(assetDir)) {
  if (f.startsWith('tgan_duck-')) {
    try { import('node:fs').then(({ unlinkSync }) => unlinkSync(assetDir + f)); } catch {}
  }
}
