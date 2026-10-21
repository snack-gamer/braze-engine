// Dump per-row layout offsets so I can see why the divider is shifting.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.rail-left', { timeout: 20000 });
await page.waitForTimeout(1200);

await page.evaluate(() => {
  document.querySelector('.workspace').style.setProperty('--rail-l', '320px');
});
await page.waitForTimeout(150);

const rows = await page.$$eval('.object-row', (nodes) =>
  nodes.map((row) => {
    const rect = row.getBoundingClientRect();
    const name = row.querySelector('.object-name')?.textContent?.trim() ?? '';
    const actions = row.querySelector('.object-actions');
    const tags = row.querySelector('.modifier-tags');
    const nameEl = row.querySelector('.object-name');
    return {
      name,
      rowLeft: rect.left,
      rowRight: rect.right,
      rowWidth: rect.width,
      nameLeft: nameEl?.getBoundingClientRect().left,
      nameRight: nameEl?.getBoundingClientRect().right,
      nameWidth: nameEl?.getBoundingClientRect().width,
      actionsLeft: actions?.getBoundingClientRect().left,
      actionsWidth: actions?.getBoundingClientRect().width,
      tagsLeft: tags?.getBoundingClientRect().left,
      tagsWidth: tags?.getBoundingClientRect().width,
      tagsChildCount: tags?.children.length,
    };
  }),
);
console.log(JSON.stringify(rows, null, 2));
await browser.close();
