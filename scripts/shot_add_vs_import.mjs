// Verify the split between "Add" (Objects header) and "Import" (Assets browser):
//   • Add menu has only scene primitives (no file import).
//   • Import menu (renamed from Create) leads with imports, ends with create.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 980 },
  deviceScaleFactor: 2,
});
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.rail-left', { timeout: 20000 });
await page.waitForTimeout(1200);

// Open the Add menu and snapshot.
await page.locator('.rail-left .add-menu__trigger').click();
await page.waitForTimeout(120);
const addItems = await page.locator('.add-menu__popover button').allTextContents();
console.log('Add menu items:', addItems);
await page.screenshot({
  path: '/tmp/tgan_add_menu_only_objects.png',
  clip: { x: 0, y: 0, width: 700, height: 360 },
});
// Close the menu.
await page.locator('body').click({ position: { x: 1500, y: 950 } });
await page.waitForTimeout(120);

// Open the Import menu in the asset browser and snapshot.
await page.locator('.assets__create').click();
await page.waitForTimeout(120);
const importItems = await page.locator('.hier-menu button').allTextContents();
console.log('Import menu items:', importItems);
await page.screenshot({
  path: '/tmp/tgan_import_menu_files_first.png',
  clip: { x: 0, y: 0, width: 700, height: 360 },
});

await browser.close();

const addHasImport = addItems.some((t) => /import/i.test(t));
const importLeadsWithImports =
  importItems.length >= 5 &&
  /Import Model/i.test(importItems[0]) &&
  /Import Image/i.test(importItems[1]) &&
  /Import HDRI/i.test(importItems[2]);

if (addHasImport) {
  console.error('FAIL: Add menu still contains an Import item');
  process.exit(1);
}
if (!importLeadsWithImports) {
  console.error('FAIL: Import menu does not lead with Import Model + Import HDRI');
  process.exit(1);
}
console.log('PASS');
