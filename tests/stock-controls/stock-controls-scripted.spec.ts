import { expect, test, type Page } from "playwright/test";
import { focusStockGame, openStockEditor, unlockStockGame } from "./stock-controls-browser";
import { stockControlPixels } from "./stock-controls-pixels";
import { STOCK_CONTROL_PLAYER_SUBPATH } from "./stock-controls-player-export.mjs";
import { stockControlBrowserStyle as style } from "./stock-controls-browser-settings.mjs";
import type {} from "../gameplay/fixtures/stock-controls-game";
import type { GameCharacterPose } from "../../src/character-controller/domain/game-character-commands";

const panel = (page: Page) => page.getByRole("complementary", { name: "Stock controls review" });
const snapshot = (page: Page) => page.evaluate(() => window.stockControlsProbe.snapshot());
const ticks = (page: Page) => page.evaluate(() => window.stockControlsProbe.ticks);
const cameraYaw = (page: Page) => page.evaluate(() => {
  const pose = window.stockControlsProbe.context!.camera.snapshot()!;
  return Math.atan2(pose.target[0] - pose.position[0], pose.target[2] - pose.position[2]) * 180 / Math.PI;
});
async function consumeFollowingTicks(page: Page, count = 3) {
  const afterEvent = await ticks(page);
  await expect.poll(() => ticks(page)).toBeGreaterThanOrEqual(afterEvent + count);
}

function expectGroundedPose(actual: GameCharacterPose | null, expected: GameCharacterPose | null) {
  expect(expected?.grounded).toBe(true);
  // Live floor-contact solves may differ by one floating-point rounding bit in Y.
  expect(actual).toEqual({ ...expected, position: [expected!.position[0], expect.closeTo(expected!.position[1], 12), expected!.position[2]] });
}

for (const player of [false, true]) test(`${player ? "player" : "editor"}: stock composition, exclusive ownership, custom replacement and fresh pooled controllers`, async ({ page, request }) => {
  const errors: string[] = [], apis: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  if (player) page.on("request", (req) => { if (/\/(api|__braze)\//.test(new URL(req.url()).pathname)) apis.push(req.url()); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  let invoke: Awaited<ReturnType<typeof openStockEditor>> | undefined, saved: string | undefined;
  if (player) await page.goto(`http://127.0.0.1:4374/${STOCK_CONTROL_PLAYER_SUBPATH}/player.html`);
  else {
    invoke = await openStockEditor(page, request); await invoke("editor.save");
    saved = await (await request.get("/api/scenes/current")).text(); await invoke("editor.transport", { action: "play" });
  }
  await expect(panel(page)).toContainText("Stock: active");
  await expect.poll(async () => (await snapshot(page))?.grounded).toBe(true);
  await expect.poll(async () => (await stockControlPixels(page)).orange.count).toBeGreaterThan(100);
  const initial = await snapshot(page), initialDraw = await stockControlPixels(page);
  expect(initial!.yawDegrees).toBeCloseTo(0, 5);
  if (style === "third-person") expect(await page.evaluate(() => window.stockControlsProbe.context!.camera.snapshot()!.position[2])).toBeGreaterThan(-2.9);
  expect(await page.evaluate(() => window.stockControlsProbe.context!.input.pointerLockStatus().status)).toBe("unlocked");
  await focusStockGame(page);
  await expect.poll(() => page.evaluate(() => window.stockControlsProbe.context!.input.pointerLockStatus())).toMatchObject({ status: style === "top-down" ? "unlocked" : "locked" });
  await page.keyboard.down("w");
  try { await expect.poll(async () => (await snapshot(page))!.position[2]).toBeGreaterThan(initial!.position[2] + 0.6); }
  finally { await page.keyboard.up("w"); }
  await consumeFollowingTicks(page);
  await expect.poll(async () => {
    const drawn = await stockControlPixels(page);
    return Math.max(Math.abs(drawn.orange.width - initialDraw.orange.width), Math.abs(drawn.orange.y - initialDraw.orange.y));
  }).toBeGreaterThan(3);
  await unlockStockGame(page);

  // Typing in a real UI control releases input and cannot move the stock character.
  await panel(page).getByLabel("Stock controls typing probe", { exact: true }).focus();
  const typingPose = await snapshot(page);
  await page.keyboard.down("w"); await consumeFollowingTicks(page, 6); await page.keyboard.up("w");
  expectGroundedPose(await snapshot(page), typingPose);
  await page.evaluate(() => window.stockControlsProbe.rebindLookRate());
  await focusStockGame(page); await page.keyboard.down("l");
  try { await expect.poll(async () => Math.abs(await cameraYaw(page))).toBeGreaterThan(30); }
  finally { await page.keyboard.up("l"); }
  await consumeFollowingTicks(page);
  const turned = await snapshot(page);
  await page.keyboard.down("w");
  try { await expect.poll(async () => (await snapshot(page))!.position[0]).toBeGreaterThan(turned!.position[0] + 0.25); }
  finally { await page.keyboard.up("w"); }
  await consumeFollowingTicks(page);
  expect((await snapshot(page))!.position[2]).toBeGreaterThan(turned!.position[2] + 0.1);
  const beforeJump = await snapshot(page); await page.keyboard.press("Space");
  await expect.poll(async () => (await snapshot(page))!.position[1]).toBeGreaterThan(beforeJump!.position[1] + 0.4);
  await expect.poll(async () => (await snapshot(page))!.grounded).toBe(true);
  await unlockStockGame(page);

  await page.evaluate(() => window.stockControlsProbe.tryConflicts());
  await expect.poll(() => page.evaluate(() => window.stockControlsProbe.bypassConflict)).toContain("owned");
  expect(await page.evaluate(() => window.stockControlsProbe.characterConflict)).toContain("owned");
  expect(await page.evaluate(() => window.stockControlsProbe.cameraConflict)).toContain("owned");
  await panel(page).getByRole("button", { name: "Disable stock", exact: true }).click();
  await expect(panel(page)).toContainText("Stock: disabled");
  expect(await page.evaluate(() => window.stockControlsProbe.context!.camera.snapshot())).toBeNull();
  expect(await page.evaluate(() => window.stockControlsProbe.context!.input.pointerLockStatus().status)).toBe("unlocked");
  const disabled = await snapshot(page); await consumeFollowingTicks(page); expect(await snapshot(page)).toEqual(disabled);

  await panel(page).getByRole("button", { name: "Attach custom", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.stockControlsProbe.custom?.read().status)).toBe("active");
  await focusStockGame(page);
  const customViewYaw = await cameraYaw(page);
  await page.keyboard.down("l"); await consumeFollowingTicks(page, 6); await page.keyboard.up("l");
  expect(await cameraYaw(page)).toBeCloseTo(customViewYaw, 8);
  await panel(page).getByRole("button", { name: "Walk custom", exact: true }).click();
  await expect.poll(async () => (await snapshot(page))!.position[0]).toBeGreaterThan(2.4);
  expect((await snapshot(page))!.position[0]).toBeLessThan(2.56);
  const facingDelta = ((await snapshot(page))!.yawDegrees - await cameraYaw(page) + 540) % 360 - 180;
  expect(facingDelta).toBeCloseTo(90, 6);
  expect(await page.evaluate(() => window.stockControlsProbe.context!.camera.snapshot()?.fov)).toBe(55);
  const endedCharacter = await page.evaluateHandle(() => window.stockControlsProbe.customCharacter);
  await panel(page).getByRole("button", { name: "Detach custom", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.stockControlsProbe.custom?.read().status)).toBe("disposed");
  expect(await page.evaluate(() => [window.stockControlsProbe.customCreates, window.stockControlsProbe.customDisposes, window.stockControlsProbe.customCleanups])).toEqual([1, 1, 1]);
  expect(await endedCharacter.evaluate((lease) => { try { lease!.snapshot(); return "accepted"; } catch (error) { return String(error); } })).toContain("ended");
  await endedCharacter.dispose();

  await panel(page).getByRole("button", { name: "Acquire stock prefab", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.stockControlsProbe.actor))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.stockControlsProbe.stock(window.stockControlsProbe.actor!.entities.character)?.read().status)).toBe("active");
  const old = await page.evaluate(() => {
    const probe = window.stockControlsProbe, handle = probe.actor!.entities.character;
    return { slot: handle.slot, generation: handle.generation, pose: probe.snapshot(handle) };
  });
  await focusStockGame(page); await page.keyboard.down("l");
  try { await expect.poll(async () => Math.abs(await cameraYaw(page))).toBeGreaterThan(20); }
  finally { await page.keyboard.up("l"); }
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => window.stockControlsProbe.snapshot(window.stockControlsProbe.actor!.entities.character)!.position[1])).toBeGreaterThan(old.pose!.position[1] + 0.4);
  await unlockStockGame(page);
  await panel(page).getByRole("button", { name: "Return stock prefab", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.stockControlsProbe.pool!.stats().available)).toBe(1);
  expect(await page.evaluate(() => window.stockControlsProbe.context!.camera.snapshot())).toBeNull();
  await panel(page).getByRole("button", { name: "Test old handle", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.stockControlsProbe.staleResult)).toBe("stale-handle");
  await panel(page).getByRole("button", { name: "Acquire stock prefab", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.stockControlsProbe.actor))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.stockControlsProbe.snapshot(window.stockControlsProbe.actor!.entities.character)?.grounded)).toBe(true);
  const fresh = await page.evaluate(() => {
    const probe = window.stockControlsProbe, handle = probe.actor!.entities.character;
    return { slot: handle.slot, generation: handle.generation, pose: probe.snapshot(handle) };
  });
  expect(fresh.slot).toBe(old.slot); expect(fresh.generation).toBeGreaterThan(old.generation);
  expect(fresh.pose!.position).toEqual([-1.2, expect.closeTo(initial!.position[1], 12), 0]);
  expect(fresh.pose!.yawDegrees).toBeCloseTo(0, 5);
  const pooledHeld = fresh.pose; await consumeFollowingTicks(page);
  expectGroundedPose(await page.evaluate(() => window.stockControlsProbe.snapshot(window.stockControlsProbe.actor!.entities.character)), pooledHeld);
  await panel(page).getByRole("button", { name: "Return stock prefab", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.stockControlsProbe.pool!.stats().available)).toBe(1);
  await page.evaluate(() => window.stockControlsProbe.pool!.dispose());
  await panel(page).getByRole("button", { name: "Enable stock", exact: true }).click();
  await expect(panel(page)).toContainText("Stock: active");
  expect(await page.evaluate(() => window.stockControlsProbe.context!.behaviors.stats())).toMatchObject({ attached: 1, enabled: 1 });

  if (invoke) {
    // TPS replacement faces its movement direction. Turn the resumed stock
    // view toward the landmark before checking paused viewport restoration.
    await page.evaluate(() => window.stockControlsProbe.context!.input.rebind("lookRateX", [{ device: "keyboard", code: "KeyL", scale: -1 }]));
    await focusStockGame(page); await page.keyboard.down("l");
    try { await expect.poll(async () => Math.abs(await cameraYaw(page))).toBeLessThan(15); }
    finally { await page.keyboard.up("l"); }
    await consumeFollowingTicks(page); await unlockStockGame(page);
    await invoke("editor.transport", { action: "pause" });
    const held = { character: await snapshot(page), camera: await page.evaluate(() => window.stockControlsProbe.context!.camera.snapshot()), ticks: await ticks(page) };
    await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick(); await expect(page.locator(".three-host")).toHaveCount(0);
    await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick(); await expect(page.getByLabel("Game render viewport", { exact: true })).toBeVisible();
    await expect.poll(async () => (await stockControlPixels(page)).orange.count).toBeGreaterThan(0);
    expect({ character: await snapshot(page), camera: await page.evaluate(() => window.stockControlsProbe.context!.camera.snapshot()), ticks: await ticks(page) }).toEqual(held);
    await invoke("editor.transport", { action: "step" }); await expect.poll(() => ticks(page)).toBe(held.ticks + 1);
    await invoke("editor.transport", { action: "stop" }); await expect(panel(page)).toContainText("Active: false");
    expect(await page.evaluate(() => window.stockControlsProbe.context!.behaviors.stats())).toMatchObject({ attached: 0, enabled: 0, ended: true });
    expect(await (await request.get("/api/scenes/current")).text()).toBe(saved);
    await expect.poll(async () => (await invoke!("editor.status")).dirty).toBe(false);
    await invoke("editor.transport", { action: "play" }); await expect(panel(page)).toContainText("Stock: active");
    await expect.poll(async () => (await snapshot(page))?.grounded).toBe(true);
    expectGroundedPose(await snapshot(page), initial);
    await invoke("editor.transport", { action: "stop" });
  } else await expect(page.locator(".editor-shell, .scene-label-layer, .viewport-hud")).toHaveCount(0);
  expect(errors).toEqual([]); expect(apis).toEqual([]);
});
