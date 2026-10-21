import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });

const consoleErrors = [];
let dialogFired = false;
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push('console.error: ' + msg.text()); });
page.on('dialog', async (d) => { dialogFired = true; await d.dismiss(); });

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.removeItem('tgan.folders');
  localStorage.removeItem('tgan.itemFolders');
  localStorage.removeItem('tgan.assetsViewMode');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.workspace', { timeout: 8000 });
await page.waitForTimeout(1500);

// 1) No hover action buttons present.
const hoverButtons = await page.locator('.asset-tile__actions').count();
console.log('hover action buttons (should be 0):', hoverButtons);
await page.screenshot({ path: '/tmp/tgan_unity_root.png' });

// 2) Right-click on an HDRI: opens our in-app menu with Open + Delete.
const firstHdri = page.locator('.asset-tile.hdri-tile').first();
await firstHdri.click({ button: 'right' });
await page.waitForTimeout(200);
const hdriMenuItems = await page.$$eval('.hier-menu .hier-menu__item', els => els.map(e => e.textContent.trim()));
console.log('HDRI item context menu:', hdriMenuItems);

// 3) Click Delete -> in-app ConfirmModal appears (not Chrome dialog).
await page.locator('.hier-menu__item', { hasText: 'Delete' }).click();
await page.waitForTimeout(200);
const modalCount = await page.locator('.confirm-modal__panel').count();
const modalTitle = await page.locator('.confirm-modal__head strong').textContent();
console.log('in-app confirm modal visible:', modalCount, '· title:', modalTitle?.trim(), '· chrome dialog fired:', dialogFired);
await page.screenshot({ path: '/tmp/tgan_unity_confirm.png' });

// 4) Click Cancel - modal closes, HDRI not deleted.
const hdrisBefore = await page.locator('.asset-tile.hdri-tile').count();
await page.locator('.confirm-modal__panel .ghost-button', { hasText: 'Cancel' }).click();
await page.waitForTimeout(200);
const modalAfterCancel = await page.locator('.confirm-modal__panel').count();
const hdrisAfter = await page.locator('.asset-tile.hdri-tile').count();
console.log('modal after cancel:', modalAfterCancel, '· hdri count unchanged:', hdrisBefore === hdrisAfter);

// 5) Single click on a material — selects + highlights.
// First create a material via right-click menu.
const tiles = page.locator('.assets__tiles');
const box = await tiles.boundingBox();
await page.mouse.click(box.x + box.width - 20, box.y + box.height - 20, { button: 'right' });
await page.waitForTimeout(150);
await page.locator('.hier-menu__item', { hasText: 'New Material' }).click();
await page.waitForTimeout(200);

const matTile = page.locator('.asset-tile').filter({ has: page.locator('.asset-tile__swatch') }).first();
await matTile.click();
await page.waitForTimeout(150);
const selectedCount = await page.locator('.asset-tile.selected').count();
console.log('selected tiles after single click:', selectedCount);

// 6) Right-click material → menu has Open, Rename, Duplicate, Delete.
await matTile.click({ button: 'right' });
await page.waitForTimeout(200);
const matMenu = await page.$$eval('.hier-menu .hier-menu__item', els => els.map(e => e.textContent.trim()));
console.log('material menu items:', matMenu);

// 7) Click Rename — inline input appears, no chrome dialog.
await page.locator('.hier-menu__item', { hasText: 'Rename' }).click();
await page.waitForTimeout(200);
const editCount = await page.locator('.asset-tile--editing').count();
const focused = await page.evaluate(() => document.activeElement?.classList.contains('asset-tile__name-input'));
console.log('editing tile present:', editCount, '· input focused:', focused);
await page.keyboard.type('My Renamed Material');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
const renamedTile = await page.locator('.asset-tile__name', { hasText: 'My Renamed Material' }).count();
console.log('renamed tile present:', renamedTile);

// 8) Cmd+D to duplicate the selected material.
await page.locator('.asset-tile__name', { hasText: 'My Renamed Material' }).click();
await page.waitForTimeout(150);
const matsBeforeDup = await page.locator('.asset-tile__name').filter({ hasText: /Material/ }).count();
await page.keyboard.press('Meta+d');
await page.waitForTimeout(200);
const matsAfterDup = await page.locator('.asset-tile__name').filter({ hasText: /Material/ }).count();
console.log('material count before/after Cmd+D:', matsBeforeDup, '→', matsAfterDup);

// 9) Delete via keyboard (Backspace) → opens confirm modal.
await page.keyboard.press('Backspace');
await page.waitForTimeout(200);
const modalAfterKey = await page.locator('.confirm-modal__panel').count();
console.log('confirm modal after Backspace:', modalAfterKey);

// Press Escape to cancel.
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const modalAfterEsc = await page.locator('.confirm-modal__panel').count();
console.log('confirm modal after Escape:', modalAfterEsc);

// 10) F2 renames focused material.
await page.locator('.asset-tile__name').filter({ hasText: /Material/ }).first().click();
await page.waitForTimeout(100);
await page.keyboard.press('F2');
await page.waitForTimeout(200);
const f2Edit = await page.locator('.asset-tile--editing').count();
console.log('editing tile after F2:', f2Edit);
await page.keyboard.press('Escape');

await page.screenshot({ path: '/tmp/tgan_unity_final.png' });
console.log('chrome dialogs fired (should be 0):', dialogFired);
console.log('console errors:', consoleErrors);
await browser.close();
