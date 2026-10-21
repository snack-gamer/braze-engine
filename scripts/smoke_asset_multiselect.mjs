// Verifies multi-select + drag-multiple-to-folder in the asset browser:
//   • Shift+click extends the selection across the visible tile order.
//   • Cmd/Ctrl+click toggles individual items.
//   • Dragging one of N selected tiles onto a folder moves all N.
//
// Approach: pre-seed localStorage so a "DropTarget" folder exists and item
// folder assignments start clean. Use Playwright `click({modifiers})` to
// build a selection, then manually dispatch DragEvents with a shared
// DataTransfer so the asset browser's dragstart/dragover/drop pipeline runs
// end-to-end (Playwright's high-level dragTo doesn't reliably trigger HTML5
// DnD through React handlers).
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

await page.addInitScript(() => {
  localStorage.setItem('tgan.folders', JSON.stringify(['DropTarget']));
  localStorage.setItem('tgan.itemFolders', '{}');
});

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.assets', { timeout: 8000 });
await page.waitForTimeout(800);

// Make sure we have ≥3 non-folder items by creating materials (cheap, no
// network). Existing models/HDRIs in the workspace count too.
async function nonFolderItemCount() {
  return page.locator('.assets__tiles .asset-tile:not(.folder-tile)').count();
}

let want = 3;
let safety = 8;
while ((await nonFolderItemCount()) < want && safety-- > 0) {
  await page.locator('.assets__create').click();
  await page.waitForTimeout(80);
  await page.locator('.hier-menu button:has-text("New Material")').first().click();
  await page.waitForTimeout(150);
}

const totalItems = await nonFolderItemCount();
console.log('non-folder items present:', totalItems);
if (totalItems < 2) {
  console.error('FAIL: need at least 2 items for multi-select');
  await browser.close();
  process.exit(1);
}

const items = page.locator('.assets__tiles .asset-tile:not(.folder-tile)');

// --- Shift+click range select: click 0, then Shift+click 2 → expect 3 selected.
await items.nth(0).click();
await items.nth(Math.min(2, totalItems - 1)).click({ modifiers: ['Shift'] });
await page.waitForTimeout(80);
const shiftSelected = await page.locator(
  '.assets__tiles .asset-tile.selected:not(.folder-tile)',
).count();
console.log('Shift+click selection size:', shiftSelected);
if (shiftSelected < Math.min(3, totalItems)) {
  console.error('FAIL: Shift+click did not range-select');
  await browser.close();
  process.exit(1);
}

// --- Cmd+click toggle: removing the middle tile.
await items.nth(1).click({ modifiers: ['Meta'] });
await page.waitForTimeout(80);
const afterToggle = await page.locator(
  '.assets__tiles .asset-tile.selected:not(.folder-tile)',
).count();
console.log('after Cmd+click toggle:', afterToggle);
if (afterToggle !== Math.min(3, totalItems) - 1) {
  console.error('FAIL: Cmd+click toggle did not remove one item');
  await browser.close();
  process.exit(1);
}

// Restore a 2-item selection for the drop test.
await items.nth(0).click();
await items.nth(1).click({ modifiers: ['Shift'] });
await page.waitForTimeout(80);
const selBeforeDrop = await page.locator(
  '.assets__tiles .asset-tile.selected:not(.folder-tile)',
).count();
console.log('selection size before drop:', selBeforeDrop);

// --- Drag onto folder: dispatch a real DragEvent on one of the selected
// tiles, then dragover/drop on the folder, sharing one DataTransfer so the
// payload survives the round-trip the way a real OS-level drag would.
const dropOutcome = await page.evaluate(() => {
  const folder = document.querySelector('.assets__tiles .folder-tile');
  const selected = Array.from(
    document.querySelectorAll('.assets__tiles .asset-tile.selected:not(.folder-tile)'),
  );
  if (!folder || selected.length === 0) return { ok: false, reason: 'missing dom' };

  const dt = new DataTransfer();
  // Fire on the *inner* tile (which is what's actually [draggable]). The
  // event bubbles to the wrapper div whose onDragStart appends the
  // multi-selection payload.
  const start = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt });
  selected[0].dispatchEvent(start);
  const types = Array.from(dt.types);

  const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
  folder.dispatchEvent(over);

  const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
  folder.dispatchEvent(drop);

  return { ok: true, types, draggedCount: selected.length };
});
console.log('drop dispatch:', dropOutcome);
await page.waitForTimeout(300);

const itemFolders = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('tgan.itemFolders') || '{}'),
);
const inTarget = Object.values(itemFolders).filter((v) => v === 'DropTarget').length;
console.log('items now inside DropTarget:', inTarget, '/', selBeforeDrop);
console.log('itemFolders map:', itemFolders);

console.log('console errors:', consoleErrors);
await browser.close();

if (inTarget < selBeforeDrop) {
  console.error('FAIL: not all selected items moved into DropTarget');
  process.exit(1);
}
console.log('PASS');
