import { expect, test } from "playwright/test";
import { characterPanel, characterSample, openCharacterEditor, renderGap, waitForCharacters } from "./runtime-character-browser";
import { coloredPixels } from "../gameplay/colored-pixels";
import { runtimeCharacterPixels } from "./runtime-character-pixels";
import type {} from "../gameplay/fixtures/runtime-character-game";

for (const player of [false, true]) test(`${player ? "player" : "editor"}: runtime character motors, saved behaviors, collision, jump, pooling and root motion`, async ({ page, request }) => {
  const errors: string[] = [], apis: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  if (player) page.on("request", (req) => { if (/^\/(api|__braze)\//.test(new URL(req.url()).pathname)) apis.push(req.url()); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  let invoke: Awaited<ReturnType<typeof openCharacterEditor>> | undefined, saved: string | undefined;
  if (player) await page.goto("http://127.0.0.1:4374/player.html");
  else {
    invoke = await openCharacterEditor(page, request); await invoke("editor.save");
    saved = await (await request.get("/api/scenes/current")).text();
    const authored = JSON.parse(saved).scene.objects as Array<{ character_controller?: { enabled?: boolean } | null }>;
    expect(authored.some((object) => object.character_controller?.enabled)).toBe(false);
    await invoke("editor.transport", { action: "play" });
  }
  await expect(characterPanel(page)).toContainText("Active: true");
  expect(await page.evaluate(() => window.runtimeCharacterProbe.context!.entities.filter((entity) => entity.character).length)).toBe(0);
  const emptyPixels = await coloredPixels(page);
  await characterPanel(page).getByRole("button", { name: "Spawn character", exact: true }).click(); await waitForCharacters(page, 1);
  await expect.poll(async () => (await coloredPixels(page)).cyan).toBeGreaterThan(emptyPixels.cyan + 100);
  const initialDraw = await runtimeCharacterPixels(page), initialX = (await characterSample(page))[0].result!.position[0];
  await page.evaluate(() => window.runtimeCharacterProbe.move(0, 1, 0));
  await expect.poll(async () => (await characterSample(page))[0].result!.position[0]).toBeGreaterThan(initialX + 0.6);
  await page.evaluate(() => window.runtimeCharacterProbe.move(0, 0, 0));
  await expect.poll(async () => (await runtimeCharacterPixels(page)).cyan.x).toBeGreaterThan(initialDraw.cyan.x + 6);
  await characterPanel(page).getByRole("button", { name: "Spawn character", exact: true }).click(); await waitForCharacters(page, 2);
  expect((await characterSample(page)).map((actor) => actor.speed)).toEqual([3, 3]);
  expect(await page.evaluate(() => window.runtimeCharacterProbe.behaviorCreates)).toBe(2);
  await page.evaluate(() => { window.runtimeCharacterProbe.move(0, 1, 0); window.runtimeCharacterProbe.move(1, 0, 1); });
  await expect.poll(async () => (await characterSample(page))[0].result!.position[0]).toBeGreaterThan(2.4);
  const collision = await characterSample(page);
  expect(collision[0].result!.position[0]).toBeLessThan(2.56);
  expect(collision[1].result!.position[0]).toBeCloseTo(-1.2, 5);
  expect(collision[1].result!.position[2]).toBeGreaterThan(1.5);
  expect(collision.map((actor) => actor.result!.scope)).toEqual(["static", "static"]);
  await characterPanel(page).getByRole("button", { name: "Stop walking", exact: true }).click();
  await renderGap(page);

  if (invoke) {
    await invoke("editor.transport", { action: "pause" }); await renderGap(page);
    const before = await characterSample(page); await renderGap(page); expect(await characterSample(page)).toEqual(before);
    await page.evaluate(() => window.runtimeCharacterProbe.move(1, 0, -1));
    for (let step = 0; step < 3; step++) {
      const tick = await page.evaluate(() => window.runtimeCharacterProbe.ticks);
      await invoke("editor.transport", { action: "step" });
      await expect.poll(() => page.evaluate(() => window.runtimeCharacterProbe.ticks)).toBe(tick + 1);
    }
    const after = await characterSample(page);
    expect(after.map((actor, index) => actor.ticks - before[index].ticks)).toEqual([3, 3]);
    expect(after[1].result!.position[2] - before[1].result!.position[2]).toBeCloseTo(-3 * 3 / 60, 5);
    await page.evaluate(() => window.runtimeCharacterProbe.move(1, 0, 0));
    await invoke("editor.transport", { action: "play" });
  }
  const groundedHeight = (await characterSample(page))[0].result!.position[1];
  await characterPanel(page).getByRole("button", { name: "Jump first", exact: true }).click();
  await expect.poll(async () => (await characterSample(page))[0].maxY).toBeGreaterThan(groundedHeight + 0.7);
  await expect.poll(async () => (await characterSample(page))[0].result!.grounded).toBe(true);
  expect((await characterSample(page))[0].result!.position[1]).toBeCloseTo(groundedHeight, 3);

  await characterPanel(page).getByRole("button", { name: "Remove last", exact: true }).click();
  await waitForCharacters(page, 1);
  await characterPanel(page).getByRole("button", { name: "Test old handle", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.runtimeCharacterProbe.staleResult)).toBe("stale-handle");
  expect(await page.evaluate(() => window.runtimeCharacterProbe.context!.world.isAlive(window.runtimeCharacterProbe.old!))).toBe(false);
  expect(await page.evaluate(() => [window.runtimeCharacterProbe.behaviorDisposes, window.runtimeCharacterProbe.cleanups])).toEqual([1, 1]);

  await characterPanel(page).getByRole("button", { name: "Acquire character", exact: true }).click(); await waitForCharacters(page, 2);
  const pooled = (await characterSample(page))[1];
  await page.evaluate(() => { window.runtimeCharacterProbe.move(1, -1, 0); window.runtimeCharacterProbe.jump(1); });
  await expect.poll(async () => (await characterSample(page))[1].maxY).toBeGreaterThan(pooled.result!.position[1] + 0.7);
  await characterPanel(page).getByRole("button", { name: "Remove last", exact: true }).click(); await waitForCharacters(page, 1);
  await expect.poll(() => page.evaluate(() => window.runtimeCharacterProbe.pool!.stats().available)).toBe(1);
  await characterPanel(page).getByRole("button", { name: "Acquire character", exact: true }).click(); await waitForCharacters(page, 2);
  const fresh = (await characterSample(page))[1];
  expect(fresh.handle.slot).toBe(pooled.handle.slot); expect(fresh.handle.generation).toBeGreaterThan(pooled.handle.generation);
  expect(fresh.initial!.position[0]).toBeCloseTo(-1.2, 5); expect(fresh.initial!.position[2]).toBeCloseTo(1, 5);
  expect(fresh.maxY).toBeLessThan(fresh.initial!.position[1] + 0.02); expect(fresh.speed).toBe(3);
  const clean = await characterSample(page); await renderGap(page);
  const stationary = (await characterSample(page))[1].result!.position, previous = clean[1].result!.position;
  expect([stationary[0], stationary[2]]).toEqual([previous[0], previous[2]]);
  // The running floor-contact solve can differ by one floating-point rounding bit.
  expect(stationary[1]).toBeCloseTo(previous[1], 12);
  await characterPanel(page).getByRole("button", { name: "Remove last", exact: true }).click(); await waitForCharacters(page, 1);
  await expect.poll(() => page.evaluate(() => window.runtimeCharacterProbe.pool!.stats().available)).toBe(1);
  await characterPanel(page).getByRole("button", { name: "Dispose pool", exact: true }).click();

  // A saved imported Animator must route root motion to this exact runtime motor.
  await characterPanel(page).getByRole("button", { name: "Spawn root-motion skin", exact: true }).click(); await waitForCharacters(page, 2);
  // Hold the public Animator clock while its first GPU draw becomes visible.
  await page.evaluate(() => {
    const probe = window.runtimeCharacterProbe;
    probe.context!.animation.setFloat(probe.handle(1)!, "speed", 0);
  });
  await renderGap(page);
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeGreaterThan(emptyPixels.orange + 100);
  const skinDraw = await runtimeCharacterPixels(page);
  const rootStart = (await characterSample(page))[1].result!.position[0];
  await page.evaluate(() => {
    const probe = window.runtimeCharacterProbe;
    probe.context!.animation.setFloat(probe.handle(1)!, "speed", 1);
  });
  await expect.poll(async () => (await characterSample(page))[1].result!.position[0]).toBeGreaterThan(rootStart + 0.25);
  await expect.poll(async () => (await runtimeCharacterPixels(page)).orange.x).toBeGreaterThan(skinDraw.orange.x + 6);
  await expect.poll(async () => (await characterSample(page))[1].result!.position[0]).toBeGreaterThan(2.4);
  expect((await characterSample(page))[1].result!.position[0]).toBeLessThan(2.56);
  await characterPanel(page).getByRole("button", { name: "Hold root motion", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.runtimeCharacterProbe.context!.animation.snapshot(window.runtimeCharacterProbe.handle(1)!)?.layers[0].currentStateId)).toBe("hold");

  if (invoke) {
    await invoke("editor.transport", { action: "pause" }); await renderGap(page);
    const before = await characterSample(page);
    await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick(); await expect(page.locator(".three-host")).toHaveCount(0);
    await renderGap(page); expect(await characterSample(page)).toEqual(before);
    await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick();
    await expect(page.getByLabel("Game render viewport", { exact: true })).toBeVisible();
    await expect.poll(async () => (await coloredPixels(page)).orange).toBeGreaterThan(emptyPixels.orange + 100);
    await expect.poll(async () => (await coloredPixels(page)).cyan).toBeGreaterThan(emptyPixels.cyan + 100);
    expect(await characterSample(page)).toEqual(before);
    await page.screenshot({ path: "/tmp/braze-runtime-characters-editor.png" });
    await invoke("editor.transport", { action: "stop" }); await expect(characterPanel(page)).toContainText("Active: false");
    expect(await page.evaluate(() => window.runtimeCharacterProbe.context!.world.stats())).toMatchObject({ ended: true, runtime: 0 });
    expect(await page.evaluate(() => [window.runtimeCharacterProbe.behaviorCreates, window.runtimeCharacterProbe.behaviorDisposes, window.runtimeCharacterProbe.cleanups])).toEqual([5, 5, 5]);
    await expect.poll(async () => (await invoke!("editor.status")).dirty).toBe(false);
    expect(await (await request.get("/api/scenes/current")).text()).toBe(saved);
    await invoke("editor.transport", { action: "play" }); await expect(characterPanel(page)).toContainText("Characters: 0");
    await invoke("editor.transport", { action: "stop" });
  } else {
    await expect(page.locator(".editor-shell, .scene-label-layer, .viewport-hud")).toHaveCount(0);
    await page.screenshot({ path: "/tmp/braze-runtime-characters-player.png" });
  }
  expect(errors).toEqual([]); expect(apis).toEqual([]);
});

test("editor: Stop during imported character preparation cancels the motor, behavior and late view", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const invoke = await openCharacterEditor(page, request);
  let release!: () => void, requested = false;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/3d-models/Runtime%20Character%20Skin.gltf*", async (route) => {
    const response = await route.fetch(); requested = true; await held; await route.fulfill({ response });
  });
  try {
    await invoke("editor.transport", { action: "play" }); await expect(characterPanel(page)).toContainText("Active: true");
    await characterPanel(page).getByRole("button", { name: "Spawn root-motion skin", exact: true }).click();
    await expect.poll(() => requested).toBe(true); await expect(characterPanel(page)).toContainText("Pending: preparing");
    await invoke("editor.transport", { action: "stop" }); await expect(characterPanel(page)).toContainText("Active: false");
    release(); await renderGap(page);
    expect(await page.evaluate(() => window.runtimeCharacterProbe.context!.world.stats())).toMatchObject({ ended: true, runtime: 0, reserved: 0 });
    expect(await page.evaluate(() => window.runtimeCharacterProbe.behaviorCreates)).toBe(0);
    await page.unroute("**/3d-models/Runtime%20Character%20Skin.gltf*");
    await invoke("editor.transport", { action: "play" }); await expect(characterPanel(page)).toContainText("Characters: 0");
    await characterPanel(page).getByRole("button", { name: "Spawn root-motion skin", exact: true }).click(); await waitForCharacters(page, 1);
    await invoke("editor.transport", { action: "stop" }); expect(errors).toEqual([]);
  } finally { release(); }
});
