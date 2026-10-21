import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.object-list', { timeout: 8000 });
await page.waitForTimeout(1200);
// Diagnostic: read computed style of swatch to confirm HMR picked up CSS.
const diag = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.object-row')];
  return rows.map(r => ({
    children: [...r.children].map(c => ({
      cls: c.className,
      tag: c.tagName,
      text: (c.textContent || '').slice(0, 30),
      rect: c.getBoundingClientRect(),
    })),
  }));
});
console.log(JSON.stringify(diag, null, 2));
// Crop to the hierarchy panel only.
const rail = await page.locator('.rail-left').boundingBox();
await page.screenshot({
  path: '/tmp/tgan_hierarchy.png',
  clip: { x: rail.x, y: 60, width: rail.width, height: 360 },
});
// 2x zoom for clarity
await page.evaluate(() => { document.body.style.zoom = '2'; });
await page.waitForTimeout(200);
await page.screenshot({
  path: '/tmp/tgan_hierarchy_2x.png',
  clip: { x: rail.x * 2, y: 120, width: rail.width * 2, height: 600 },
});
await browser.close();
