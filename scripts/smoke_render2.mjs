import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.three-host canvas', { timeout: 8000 });
await page.waitForTimeout(2000);

// Capture controls so a fresh payload exists with the NEW depth pass.
await page.click('button:has-text("Capture controls")');
await page.waitForTimeout(3500);

// Trigger render via the preview window.
await page.click('button[title="Show image preview"]');
await page.waitForSelector('.preview-window', { timeout: 3000 });
await page.click('.preview-window .status-button.run');
console.log('triggered render');
const start = Date.now();

const result = await page.evaluate(async () => {
  for (let i = 0; i < 200; i++) {
    const r = await fetch('/api/image/status');
    const j = await r.json();
    if (['done', 'error', 'stopped'].includes(j.job.state)) {
      return { state: j.job.state, msg: j.job.message, output: j.job.outputPath, payloadPath: j.job.payloadPath };
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return { state: 'timeout' };
});
console.log(`finished after ${((Date.now() - start) / 1000).toFixed(1)}s`);
console.log(JSON.stringify(result, null, 2));

console.log('errors:', errors.filter((e) => !e.includes('WebSocket')).length);
await browser.close();
