import { expect, test } from "playwright/test";
import { createSceneTemplate } from "../../src/scene/application/scene-templates";
import { makeObject } from "../../src/lib/payload";
import { serializeSceneObject } from "../../src/scene/serialization/scene-object-encoder";

test("Inspector fields stay compact and layer menus preserve layout, focus and viewport bounds", async ({ page, request }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const source = createSceneTemplate("Inspector layout"), id = `inspector-${crypto.randomUUID()}`;
  const scene = { ...source, objects: [...source.objects,
    serializeSceneObject(makeObject("cube", 0, { id: "layout-cube", name: "Layout Cube" }))] };
  expect((await request.put(`/api/scenes/${id}`, { data: { baseRevision: null, scene } })).ok()).toBe(true);
  await page.goto(`/?scene=${id}`);
  const trigger = page.getByRole("button", { name: "Camera culling mask", exact: true });
  const menu = page.getByRole("menu", { name: "Camera culling mask", exact: true });
  const background = page.getByLabel("Camera background", { exact: true });
  const lookThrough = page.getByRole("button", { name: "Look through", exact: true });
  for (const [width, height] of [[1800, 950], [1000, 900], [1800, 600]]) {
    await page.setViewportSize({ width, height });
    const fields = [page.getByLabel("Camera projection", { exact: true }), page.getByLabel("Field of View axis", { exact: true }), background, trigger];
    const metrics = await Promise.all(fields.map((field) => field.evaluate((element) => {
      const rect = element.getBoundingClientRect(), row = element.closest(".inspector-row")!;
      const label = row.querySelector(".inspector-row__label")!.getBoundingClientRect();
      return { width: rect.width, x: rect.x, h: rect.height, alignment: Math.abs(label.y + label.height / 2 - rect.y - rect.height / 2) };
    })));
    for (const metric of metrics) {
      expect(metric.width).toBeLessThanOrEqual(180);
      expect(metric.width).toBeGreaterThan(90);
      expect(metric.h).toBe(22);
      expect(metric.alignment).toBeLessThan(1);
      expect(metric.x).toBeCloseTo(metrics[0].x, 0);
    }
    const actionGap = await lookThrough.evaluate((button) => {
      const next = button.nextElementSibling!;
      return next.getBoundingClientRect().left - button.getBoundingClientRect().right;
    });
    expect(actionGap).toBeGreaterThanOrEqual(8);
    // A short dock may scroll its trigger into view before the click. Measure
    // layout after that navigation, independently of opening the overlay.
    await trigger.scrollIntoViewIfNeeded();
    const before = { background: await background.boundingBox(), action: await lookThrough.boundingBox(), trigger: await trigger.boundingBox() };
    await trigger.click();
    await expect(menu).toBeVisible();
    expect((await background.boundingBox())!.y).toBeCloseTo(before.background!.y, 1);
    expect((await lookThrough.boundingBox())!.y).toBeCloseTo(before.action!.y, 1);
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(8); expect(box.x + box.width).toBeLessThanOrEqual(width - 8);
    expect(box.y).toBeGreaterThanOrEqual(8); expect(box.y + box.height).toBeLessThanOrEqual(height - 8);
    expect(box.height).toBeLessThanOrEqual(320);
    const below = height - before.trigger!.y - before.trigger!.height - 12;
    if (below < 320 && before.trigger!.y - 12 > below) expect(box.y + box.height).toBeLessThanOrEqual(before.trigger!.y);
    const centered = await trigger.evaluate((button) => {
      const field = button.getBoundingClientRect(), arrow = button.querySelector("svg")!.getBoundingClientRect();
      return Math.abs(field.y + field.height / 2 - arrow.y - arrow.height / 2);
    });
    expect(centered).toBeLessThan(1);
    await page.screenshot({ path: info.outputPath(`inspector-menu-${width}-${height}.png`) });
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0); await expect(trigger).toBeFocused();
  }
  await trigger.press("ArrowDown");
  await expect(menu.getByRole("menuitemcheckbox", { name: "Nothing", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  const lastLayer = menu.getByRole("menuitemcheckbox", { name: "Render layer 31: Unnamed", exact: true });
  await expect(lastLayer).toBeFocused(); await page.keyboard.press("Space");
  await expect(lastLayer).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Home"); await page.keyboard.press("Enter");
  await expect(trigger).toHaveText("Nothing");
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Space");
  await expect(trigger).toHaveText("Everything");
  await page.keyboard.press("Tab"); await expect(menu).toHaveCount(0); await expect(lookThrough).toBeFocused();
  await trigger.click();
  await page.setViewportSize({ width: 1500, height: 750 });
  await expect(menu).toHaveCount(0);
  await trigger.click(); await page.getByRole("button", { name: "Environment", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await page.getByRole("treeitem", { name: /^Layout Cube/ }).click();
  const shadows = page.getByLabel("Cast Shadows", { exact: true });
  await expect(shadows).toBeVisible();
  expect((await shadows.boundingBox())!.width).toBeLessThanOrEqual(180);
  expect(errors).toEqual([]);
});

test("identity edges, resting hierarchy actions and numeric ink share balanced field geometry", async ({ page, request }, info) => {
  const id = `identity-${crypto.randomUUID()}`, scene = createSceneTemplate("Identity geometry");
  expect((await request.put(`/api/scenes/${id}`, { data: { baseRevision: null, scene } })).ok()).toBe(true);
  await page.goto(`/?scene=${id}`);
  await page.getByRole("heading", { name: "Braze Engine", exact: true }).hover();
  for (const width of [1800, 1000]) {
    await page.setViewportSize({ width, height: 950 });
    const geometry = await page.locator(".rail-right").evaluate((pane) => {
      const rect = (selector: string) => pane.querySelector(selector)!.getBoundingClientRect();
      const name = rect('.panel-header__name'), tag = rect('[aria-label="Object tag"]'), layer = rect('[aria-label="Object layer"]');
      return { tagLeft: tag.left - name.left, layerRight: layer.right - name.right, equalFields: tag.width - layer.width,
        glyph: rect('.panel-header__icon svg').width, lock: rect('.panel-header__actions svg').width,
        lockTarget: rect('.panel-header__actions button').height };
    });
    expect(Math.abs(geometry.tagLeft)).toBeLessThan(1);
    expect(Math.abs(geometry.layerRight)).toBeLessThan(1);
    expect(Math.abs(geometry.equalFields)).toBeLessThan(1);
    expect(geometry.glyph).toBe(16); expect(geometry.lock).toBe(14); expect(geometry.lockTarget).toBe(22);
    const actions = await page.locator('.object-row .row-icon').evaluateAll((nodes) =>
      nodes.map((node) => ({ opacity: getComputedStyle(node).opacity, visibility: getComputedStyle(node).visibility })));
    expect(actions.length).toBeGreaterThan(4);
    for (const action of actions) expect(action).toEqual({ opacity: "1", visibility: "visible" });
    const fields = page.locator('.rail-right select');
    for (const field of await fields.all()) {
      await field.hover();
      await field.focus();
      const style = await field.evaluate((element) => {
        const css = getComputedStyle(element);
        return { arrow: css.backgroundImage, position: css.backgroundPositionX, appearance: css.appearance };
      });
      expect(style.arrow).toContain('data:image/svg+xml');
      expect(style.position).toContain('8px'); expect(style.appearance).toBe('none');
    }
  }
  await page.setViewportSize({ width: 1800, height: 950 });
  await page.getByRole('spinbutton', { name: 'Position X', exact: true }).fill('-12.5');
  await page.getByRole('spinbutton', { name: 'Position X', exact: true }).press('Enter');
  await page.getByRole('heading', { name: 'Braze Engine', exact: true }).hover();
  for (const label of ['Field of View', 'Near clipping plane', 'Far clipping plane', 'Position X']) {
    const input = page.getByRole('spinbutton', { name: label, exact: true });
    const field = input.locator('..');
    const bounds = (await field.boundingBox())!, text = (await input.boundingBox())!;
    const png = (await field.screenshot()).toString('base64');
    const ink = await page.evaluate(async ({ png, x0, x1 }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let top = canvas.height, bottom = -1;
      for (let y = 2; y < canvas.height - 2; y++) for (let x = Math.ceil(x0); x < Math.floor(x1); x++) {
        const i = (y * canvas.width + x) * 4;
        if (Math.min(pixels[i], pixels[i+1], pixels[i+2]) > 170) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
      }
      return { top, bottom: canvas.height - 1 - bottom, found: bottom >= top };
    }, { png, x0: text.x - bounds.x, x1: text.x + text.width - bounds.x });
    expect(ink.found, label).toBe(true);
    expect(Math.abs(ink.top - ink.bottom), `${label}: ${JSON.stringify(ink)}`).toBeLessThanOrEqual(1);
    await field.screenshot({ path: info.outputPath(`balanced-${label.replaceAll(' ', '-')}.png`) });
  }
  await page.screenshot({ path: info.outputPath('identity-and-fields.png') });
});
