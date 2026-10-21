import { chromium } from 'playwright';

// Run with headed:false but observe pageerrors and cache state over time.
const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });

page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', msg => {
  const t = msg.type();
  if (t === 'error' || t === 'warning') console.log(`[${t}]`, msg.text());
});

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.clear();
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.workspace', { timeout: 8000 });
await page.waitForTimeout(1500);

// Probe the cache state every 2s for 30s.
for (let i = 0; i < 15; i++) {
  const counts = await page.evaluate(async () => {
    const tiles = document.querySelectorAll('.asset-tile.model-tile, .asset-tile.hdri-tile');
    const previews = document.querySelectorAll('.asset-tile__preview');
    return { tiles: tiles.length, previews: previews.length };
  });
  console.log(`t=${i*2}s — tiles: ${counts.tiles}, previews rendered: ${counts.previews}`);
  await page.waitForTimeout(2000);
  if (counts.previews >= counts.tiles) break;
}

await page.screenshot({ path: '/tmp/tgan_debug_previews.png' });
await browser.close();
