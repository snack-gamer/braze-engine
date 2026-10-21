import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 980 },
  deviceScaleFactor: 2,
});
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.rail-left .object-row', { timeout: 20000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  document.querySelector('.workspace').style.setProperty('--rail-l', '360px');
});
await page.waitForTimeout(150);

// Reparent Sun under Pirate ship (child zone).
await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.rail-left .object-row'));
  const find = (s) =>
    rows.find((r) => r.querySelector('.object-name')?.textContent?.trim().startsWith(s));
  const src = find('Sun');
  const tgt = find('Pirate ship');
  const dt = new DataTransfer();
  src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  const r = tgt.getBoundingClientRect();
  const cy = r.top + r.height / 2;
  tgt.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: cy }));
  tgt.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: cy }));
});
await page.waitForTimeout(300);
await page.locator('.rail-left').screenshot({ path: '/tmp/tgan_hierarchy_tree.png' });
console.log('saved /tmp/tgan_hierarchy_tree.png');
await browser.close();
