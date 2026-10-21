import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.three-host canvas', { timeout: 8000 });
await page.waitForTimeout(1200);

const initial = await page.$$eval('.object-row', (rows) => rows.length);
console.log('initial objects:', initial);

// Verify history buttons exist and undo is disabled initially
const undoDisabled = await page.$eval('button[title*="Undo"]', (el) => el.disabled);
const redoDisabled = await page.$eval('button[title*="Redo"]', (el) => el.disabled);
console.log('undo disabled initially:', undoDisabled, 'redo:', redoDisabled);

// Add a cube
await page.click('.add-tile:has-text("Cube")');
await page.waitForTimeout(300);
const afterAdd = await page.$$eval('.object-row', (rows) => rows.length);
console.log('after add cube:', afterAdd);

// Undo button should now be enabled
const undoEnabled = await page.$eval('button[title*="Undo"]', (el) => !el.disabled);
console.log('undo enabled after add:', undoEnabled);

// Click Undo
await page.click('button[title*="Undo"]');
await page.waitForTimeout(200);
const afterUndo = await page.$$eval('.object-row', (rows) => rows.length);
console.log('after undo:', afterUndo);

// Click Redo
await page.click('button[title*="Redo"]');
await page.waitForTimeout(200);
const afterRedo = await page.$$eval('.object-row', (rows) => rows.length);
console.log('after redo:', afterRedo);

// Test keyboard shortcut Cmd+Z
await page.keyboard.press('Meta+z');
await page.waitForTimeout(200);
const afterKeyUndo = await page.$$eval('.object-row', (rows) => rows.length);
console.log('after Cmd+Z:', afterKeyUndo);

await page.screenshot({ path: '/tmp/tgan_history.png', fullPage: false });

console.log('errors:', errors.filter((e) => !e.includes('WebSocket')).length);
await browser.close();
