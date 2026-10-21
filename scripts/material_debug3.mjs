import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', m => logs.push(`[err] ${m.message}`));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.three-host canvas');
await page.waitForTimeout(1500);

// Use force click since text is in a collapsed/hidden tree row possibly
const ships = await page.$$('text=/Pirate ship/');
console.log('ship matches:', ships.length);
for (const s of ships) {
  const box = await s.boundingBox().catch(()=>null);
  const vis = await s.isVisible().catch(()=>null);
  console.log('  match box:', JSON.stringify(box), 'visible:', vis);
}
if (ships.length) await ships[0].click({ force: true });
await page.waitForTimeout(400);

const heads = await page.$$eval('.rail-heading', els => els.map(e => e.textContent.trim()));
console.log('active object headings:', heads);

await page.screenshot({ path: '/tmp/m3_initial.png' });

// Look for material toggle
const matToggle = await page.$('.material-toggle input[type="checkbox"]');
const matChecked = matToggle ? await matToggle.isChecked() : null;
console.log('material toggle present:', !!matToggle, 'checked:', matChecked);

if (matToggle) {
  // Toggle override OFF
  await matToggle.click({ force: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/m3_off.png' });
  // Toggle back ON
  await matToggle.click({ force: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/m3_on.png' });
}

// Set emissive preset
const selects = await page.$$('select');
for (const s of selects) {
  const opts = await s.evaluate(el => Array.from(el.options).map(o => o.value)).catch(()=>[]);
  if (opts.includes('emissive')) {
    await s.selectOption('emissive');
    console.log('applied emissive preset');
    break;
  }
}
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/m3_emissive.png' });

await browser.close();
console.log('--- last 30 console ---');
for (const l of logs.slice(-30)) console.log(l);
