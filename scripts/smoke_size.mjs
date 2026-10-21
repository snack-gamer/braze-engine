import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
await page.goto('http://127.0.0.1:5179/', { waitUntil: 'networkidle' });
await page.waitForSelector('.three-host canvas', { timeout: 8000 });
await page.waitForTimeout(1200);

await page.click('button[title="Show image preview"]');
await page.waitForSelector('.preview-window', { timeout: 3000 });
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/tgan_size_m.png', fullPage: false });

await page.click('.preview-size-pill button[title="L size"]');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/tgan_size_l.png', fullPage: false });

await page.click('.preview-size-pill button[title="S size"]');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/tgan_size_s.png', fullPage: false });

console.log('errors:', JSON.stringify(errors, null, 2));
console.log('OK');
await browser.close();
