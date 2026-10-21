import { expect, test } from "playwright/test";
import { focusStockGame, openStockEditor, unlockStockGame } from "./stock-controls-browser";
import { stockControlPixels } from "./stock-controls-pixels";
import { stockControlBrowserStyle as style } from "./stock-controls-browser-settings.mjs";
import { STOCK_CONTROL_PLAYER_SUBPATH } from "./stock-controls-player-export.mjs";
import { saveStockPresetFromInspector } from "./stock-controls-preset";

for (const player of [false, true]) test(`${style} ${player ? "player" : "editor"}: saved stock controls run without a gameplay entry`, async ({ page, request }) => {
  const errors: string[] = [], apis: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  if (player) page.on("request", (req) => { if (/\/(api|__braze)\//.test(new URL(req.url()).pathname)) apis.push(req.url()); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  let invoke: Awaited<ReturnType<typeof openStockEditor>> | undefined, saved: string | undefined;
  if (player) await page.goto(`http://127.0.0.1:4374/${STOCK_CONTROL_PLAYER_SUBPATH}/player.html`);
  else {
    invoke = await openStockEditor(page, request);
    await saveStockPresetFromInspector(page, request);
    await invoke("editor.save");
    saved = await (await request.get("/api/scenes/current")).text();
    await invoke("editor.transport", { action: "play" });
  }
  expect(await page.evaluate(() => "stockControlsProbe" in window)).toBe(false);
  // The authored-camera frame may render before the first stock-controller physics tick.
  await expect.poll(async () => Number(await page.getByLabel("Game render viewport", { exact: true })
    .getAttribute("data-physics-applied-step"))).toBeGreaterThan(0);
  await expect.poll(async () => (await stockControlPixels(page)).orange.count).toBeGreaterThan(100);
  if (style !== "first-person") await expect.poll(async () => (await stockControlPixels(page)).cyan.count).toBeGreaterThan(100);
  const initial = await stockControlPixels(page);
  await focusStockGame(page);
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(style !== "top-down");
  await page.keyboard.down("w");
  try {
    await expect.poll(async () => {
      const current = await stockControlPixels(page);
      return Math.max(Math.abs(current.orange.y - initial.orange.y), Math.abs(current.orange.width - initial.orange.width));
    }).toBeGreaterThan(8);
  } finally { await page.keyboard.up("w"); }
  await unlockStockGame(page);

  if (invoke) {
    await invoke("editor.transport", { action: "pause" });
    const paused = await stockControlPixels(page);
    // Paused-view DOM telemetry is throttled to 250ms and may idle between samples.
    // The public world status reports the current physics receipt without another render.
    const appliedStep = async () => (await invoke!("editor.status")).physics.appliedStepId;
    const beforeStep = await appliedStep();
    for (let step = 0; step < 3; step++) {
      await invoke("editor.transport", { action: "step" });
      await expect.poll(appliedStep).toBeGreaterThanOrEqual(beforeStep + step + 1);
    }
    const held = await stockControlPixels(page);
    expect(held.orange.width).toBeCloseTo(paused.orange.width, 0);
    await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick();
    await expect(page.locator(".three-host")).toHaveCount(0);
    await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick();
    await expect(page.getByLabel("Game render viewport", { exact: true })).toBeVisible();
    await expect.poll(async () => (await stockControlPixels(page)).orange.width).toBeCloseTo(held.orange.width, 0);
    await expect.poll(async () => (await stockControlPixels(page)).orange.y).toBeCloseTo(held.orange.y, 0);
    await invoke("editor.transport", { action: "stop" });
    await expect.poll(async () => (await invoke!("editor.status")).dirty).toBe(false);
    expect(await (await request.get("/api/scenes/current")).text()).toBe(saved);
    await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
    await invoke("editor.transport", { action: "play" });
    await expect.poll(async () => (await stockControlPixels(page)).orange.width).toBeCloseTo(initial.orange.width, 0);
    await invoke("editor.transport", { action: "stop" });
  } else {
    await expect(page.locator(".editor-shell, .scene-label-layer, .viewport-hud")).toHaveCount(0);
  }
  await page.screenshot({ path: `/tmp/braze-stock-controls-${style}-${player ? "player" : "editor"}.png` });
  expect(apis).toEqual([]); expect(errors).toEqual([]);
});
