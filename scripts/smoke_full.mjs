import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
await page.goto('http://127.0.0.1:5179/', { waitUntil: 'networkidle' });
await page.waitForSelector('.three-host canvas', { timeout: 8000 });
await page.waitForTimeout(1200);

await page.screenshot({ path: '/tmp/tgan_refactor_scene.png', fullPage: false });

// Image Preview overlay
await page.click('button[title="Show image preview"]');
await page.waitForSelector('.preview-window', { timeout: 3000 });
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/tgan_refactor_preview.png', fullPage: false });

// Image tab
await page.click('.mode-pill button[role="tab"]:has-text("Image")');
await page.waitForSelector('.image-host', { timeout: 3000 });
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/tgan_refactor_image.png', fullPage: false });

// Video tab
await page.click('.mode-pill button[role="tab"]:has-text("Video")');
await page.waitForSelector('.video-host', { timeout: 3000 });
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/tgan_refactor_video.png', fullPage: false });

// JSON drawer
await page.click('button[title="Toggle scene payload JSON"]');
await page.waitForSelector('.drawer', { timeout: 2000 });
await page.screenshot({ path: '/tmp/tgan_refactor_json.png', fullPage: false });

// Hit the preview API
const previewResp = await page.evaluate(() => fetch('/api/previews/latest').then((r) => r.json()));
console.log('preview status:', previewResp.status);

// Hit the image status API
const imageStatus = await page.evaluate(() => fetch('/api/image/status').then((r) => r.json()));
console.log('image status:', imageStatus.status, 'state:', imageStatus.job?.state);

// Hit the video status API
const videoStatus = await page.evaluate(() => fetch('/api/render/status').then((r) => r.json()));
console.log('video status:', videoStatus.status, 'state:', videoStatus.job?.state);

console.log('errors:', JSON.stringify(errors.filter((e) => !e.includes('WebSocket')), null, 2));
console.log('OK');
await browser.close();
