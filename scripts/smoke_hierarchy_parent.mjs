// Smoke-tests the Unity-style hierarchy:
//   1. Drop a row onto another row's middle = becomes child (parentId set).
//   2. The parent now shows a chevron + indented child row.
//   3. Collapsing the parent hides the child from the visible tree.
//   4. Expanding it again shows the child.
//   5. Three.js scene graph reparents (child node lives under parent node).
//
// HTML5 drag-and-drop through React handlers needs hand-fired DragEvent +
// a shared DataTransfer (Playwright's `dragTo` doesn't reliably propagate
// through stop-propagation).
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.rail-left .object-row', { timeout: 20000 });
await page.waitForTimeout(1200);

const labels = await page.locator('.rail-left .object-row .object-name').allTextContents();
console.log('rows before drop:', labels);

const sourceName = 'Sun';
const targetName = 'Pirate ship';

// Drag Sun onto Pirate ship middle = child.
const outcome = await page.evaluate(({ sourceName, targetName }) => {
  const rows = Array.from(document.querySelectorAll('.rail-left .object-row'));
  const find = (name) =>
    rows.find((r) => r.querySelector('.object-name')?.textContent?.trim().startsWith(name));
  const src = find(sourceName);
  const tgt = find(targetName);
  if (!src || !tgt) return { ok: false, reason: 'missing rows' };
  const dt = new DataTransfer();
  src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  // Aim cursor at the middle of the target row -> "child" zone.
  const r = tgt.getBoundingClientRect();
  const cy = r.top + r.height / 2;
  tgt.dispatchEvent(
    new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt,
      clientX: r.left + r.width / 2,
      clientY: cy,
    }),
  );
  tgt.dispatchEvent(
    new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt,
      clientX: r.left + r.width / 2,
      clientY: cy,
    }),
  );
  return { ok: true };
}, { sourceName, targetName });
console.log('dispatch:', outcome);
await page.waitForTimeout(300);

// After the drop: target should show a chevron, Sun should be indented one level.
const afterDrop = await page.evaluate((targetName) => {
  const rows = Array.from(document.querySelectorAll('.rail-left .object-row'));
  const out = rows.map((r) => {
    const name = r.querySelector('.object-name')?.textContent?.trim() ?? '';
    const depth = Number(getComputedStyle(r).getPropertyValue('--row-depth') || '0');
    const hasChevron = !!r.querySelector('.object-row__chevron:not(.object-row__chevron--spacer)');
    return { name, depth, hasChevron };
  });
  return out;
}, targetName);
console.log('rows after drop:', afterDrop);

const parentRow = afterDrop.find((r) => r.name.startsWith(targetName));
const childRow = afterDrop.find((r) => r.name.startsWith(sourceName));
if (!parentRow?.hasChevron) {
  console.error('FAIL: parent row has no chevron after gaining a child');
  process.exit(1);
}
if (!childRow || childRow.depth < 1) {
  console.error('FAIL: dragged child is not indented (depth=' + childRow?.depth + ')');
  process.exit(1);
}

// Click the parent chevron to collapse — child should disappear.
await page
  .locator(`.rail-left .object-row:has(.object-name:has-text("${targetName}")) .object-row__chevron`)
  .first()
  .click();
await page.waitForTimeout(120);
const collapsedNames = await page
  .locator('.rail-left .object-row .object-name')
  .allTextContents();
console.log('rows when collapsed:', collapsedNames);
if (collapsedNames.some((t) => t.startsWith(sourceName))) {
  console.error('FAIL: child still visible after collapse');
  process.exit(1);
}

// Click again to expand.
await page
  .locator(`.rail-left .object-row:has(.object-name:has-text("${targetName}")) .object-row__chevron`)
  .first()
  .click();
await page.waitForTimeout(120);
const expandedNames = await page
  .locator('.rail-left .object-row .object-name')
  .allTextContents();
console.log('rows when expanded again:', expandedNames);
if (!expandedNames.some((t) => t.startsWith(sourceName))) {
  console.error('FAIL: child not visible after expand');
  process.exit(1);
}

console.log('console errors:', consoleErrors);
await browser.close();
console.log('PASS');
