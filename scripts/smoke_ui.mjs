import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
await page.goto('http://127.0.0.1:5179/', { waitUntil: 'networkidle' });
await page.waitForSelector('.mode-pill', { timeout: 8000 });

// snapshot scene mode
await page.screenshot({ path: '/tmp/tgan_scene.png', fullPage: false });

// switch to image mode
await page.click('button:has-text("Image")');
await page.waitForSelector('.image-host', { timeout: 4000 });
await page.screenshot({ path: '/tmp/tgan_image.png', fullPage: false });

// switch to video mode
await page.click('button:has-text("Video")');
await page.waitForSelector('.video-host', { timeout: 4000 });
await page.screenshot({ path: '/tmp/tgan_video.png', fullPage: false });

// open JSON drawer
await page.click('button[title="Toggle scene payload JSON"]');
await page.waitForSelector('.drawer', { timeout: 2000 });
await page.screenshot({ path: '/tmp/tgan_drawer.png', fullPage: false });

console.log('errors:', JSON.stringify(errors, null, 2));
console.log('OK');
await browser.close();
