import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor({ state: 'attached', timeout: 15000 });
await page.waitForTimeout(1200);
const oldProviderPill = await page.$('.model-pill');
if (oldProviderPill) throw new Error('legacy model status pill is still visible');
const oldViewportReadout = await page.$('.overlay-readout');
if (oldViewportReadout) throw new Error('legacy viewport readout is still visible');

await page.click('button[title="Keyboard shortcuts"]');
await page.waitForSelector('.shortcuts-modal', { timeout: 5000 });
const shortcutsText = await page.$eval('.shortcuts-modal', (el) => el.textContent);
if (!shortcutsText.includes('Orbit around cursor') || !shortcutsText.includes('Frame selected')) {
  throw new Error('shortcuts modal is missing viewport controls');
}
if (!shortcutsText.includes('Transform tool') || !shortcutsText.includes('Scale tool')) {
  throw new Error('shortcuts modal is missing transform controls');
}
await page.keyboard.press('Escape');
await page.waitForSelector('.shortcuts-modal', { state: 'detached', timeout: 5000 });
await page.keyboard.press('R');
await page.waitForFunction(() => document.querySelector('button[title="Rotate"]')?.classList.contains('active'));
await page.keyboard.press('S');
await page.waitForFunction(() => document.querySelector('button[title="Scale"]')?.classList.contains('active'));
await page.keyboard.press('T');
await page.waitForFunction(() => document.querySelector('button[title="Move"]')?.classList.contains('active'));

const bar = await page.$('.topbar');
const box = await bar.boundingBox();
await page.screenshot({
  path: '/tmp/tgan_topbar.png',
  clip: { x: box.x, y: box.y, width: box.width, height: box.height },
});
console.log('OK');
await browser.close();
