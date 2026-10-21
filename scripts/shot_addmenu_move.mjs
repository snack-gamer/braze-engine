// Verify the Add menu lives in the Objects rail heading now, not the topbar.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 980 },
  deviceScaleFactor: 2,
});
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.rail-left', { timeout: 20000 });
await page.waitForTimeout(1200);

// Where does the trigger live now?
const inTopbar = await page.locator('.topbar .add-menu__trigger').count();
const inRail = await page.locator('.rail-left .add-menu__trigger').count();
console.log('add-menu trigger in .topbar:', inTopbar);
console.log('add-menu trigger in .rail-left:', inRail);

// Snapshot the rail heading region.
await page.locator('.rail-left').screenshot({ path: '/tmp/tgan_addmenu_collapsed.png' });

// Open the popover and snapshot.
await page.locator('.rail-left .add-menu__trigger').click();
await page.waitForTimeout(150);
await page.screenshot({ path: '/tmp/tgan_addmenu_open.png', clip: { x: 230, y: 0, width: 540, height: 380 } });

console.log('saved /tmp/tgan_addmenu_collapsed.png and /tmp/tgan_addmenu_open.png');
await browser.close();
if (inTopbar !== 0 || inRail !== 1) {
  console.error('FAIL: expected 0 in topbar and 1 in rail-left');
  process.exit(1);
}
console.log('PASS');
