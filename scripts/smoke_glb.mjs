import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
// Generate a minimal valid GLB on disk to test the loader path.
// This is a tiny single-triangle GLB blob.
import { Buffer } from 'node:buffer';

// Minimal GLTF JSON + a tiny triangle buffer. Easier to download a real GLB:
// duck.glb is the canonical sample. Try fetching it; if unavailable, skip.

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.three-host canvas', { timeout: 8000 });
await page.waitForTimeout(800);

// Verify the file-input accept attribute now contains glb/gltf
const accept = await page.$eval('input[type="file"]', (el) => el.getAttribute('accept'));
console.log('accept:', accept);
console.log('has glb:', accept.includes('.glb'));
console.log('has gltf:', accept.includes('.gltf'));

console.log('errors:', errors.filter((e) => !e.includes('WebSocket')).length);
await browser.close();
