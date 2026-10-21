import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

// Reload — the scene was saved with 4 objects in the previous smoke
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.three-host canvas', { timeout: 8000 });
await page.waitForTimeout(1500);

const objects = await page.$$eval('.object-row', (rows) => rows.length);
console.log('objects after reload:', objects);

await page.screenshot({ path: '/tmp/tgan_persistence.png', fullPage: false });

console.log(JSON.stringify(errors.filter(e=>!e.includes('WebSocket')), null, 2));console.log('errors:', errors.filter((e) => !e.includes('WebSocket')).length);
await browser.close();
