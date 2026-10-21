import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
await page.goto('http://127.0.0.1:5179/', { waitUntil: 'networkidle' });
await page.waitForSelector('.mode-pill', { timeout: 8000 });

// Should already be in scene mode. Click Image Preview button.
await page.click('button[title="Show image preview"]');
await page.waitForSelector('.preview-window', { timeout: 3000 });
await page.screenshot({ path: '/tmp/tgan_scene_preview_open.png', fullPage: false });

// Collapse
await page.click('.preview-window-title');
await page.screenshot({ path: '/tmp/tgan_scene_preview_collapsed.png', fullPage: false });

// Expand again
await page.click('.preview-window-title');

// Close
await page.click('.preview-window-actions button[title="Close"]');
await page.screenshot({ path: '/tmp/tgan_scene_preview_closed.png', fullPage: false });

console.log('errors:', JSON.stringify(errors, null, 2));
console.log('OK');
await browser.close();
