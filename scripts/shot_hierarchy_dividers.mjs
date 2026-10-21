// Capture the LeftRail at 2x so the new dividers between name and action
// buttons are easy to inspect. Saves to /tmp/tgan_hierarchy_dividers.png.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 980 },
  deviceScaleFactor: 2,
});
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.rail-left', { timeout: 20000 });
await page.waitForTimeout(1500);

// Match a realistic rail width for the screenshot (user resizes wider than
// the 240px default once names + chips are in play).
// First: capture at the CSS default (no override) so we see what users get
// fresh out of the box.
await page.locator('.rail-left').screenshot({ path: '/tmp/tgan_hierarchy_default.png' });
const defaultWidth = await page.evaluate(() =>
  getComputedStyle(document.querySelector('.workspace')).getPropertyValue('--rail-l').trim(),
);
console.log('default --rail-l:', defaultWidth);

// Then sweep a few widths to confirm the layout adapts cleanly.
for (const [tag, width] of [['wide', 420], ['narrow', 240]]) {
  await page.evaluate((w) => {
    document.querySelector('.workspace').style.setProperty('--rail-l', `${w}px`);
  }, width);
  await page.waitForTimeout(150);
  await page
    .locator('.rail-left')
    .screenshot({ path: `/tmp/tgan_hierarchy_${tag}.png` });
}
console.log('saved /tmp/tgan_hierarchy_dividers.png');
await browser.close();
