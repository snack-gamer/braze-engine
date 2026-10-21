import { expect, test, type APIRequestContext, type Page } from "playwright/test";
import { DEFAULT_DOCK_DOCUMENT, dockPane } from "../../src/docking/layout";
import { DOCK_STORAGE_KEY } from "../../src/docking/dock-persistence";
import { coloredPixels } from "../gameplay/colored-pixels";
import type {} from "../gameplay/fixtures/runtime-animation-game";

const panel = (page: Page) => page.getByRole("complementary", { name: "Runtime animation review" });
const gap = (page: Page) => page.evaluate(async () => { for (let frame = 0; frame < 8; frame++) await new Promise(requestAnimationFrame); });
const sample = (page: Page) => page.evaluate(() => {
  const probe = window.runtimeAnimationProbe;
  return probe.instances.map((entry, index) => ({ handle: { slot: probe.handle(index)!.slot, generation: probe.handle(index)!.generation },
    snapshot: probe.snapshot(index), initial: entry.initial, events: probe.eventCount(index) }));
});
const markers = (time: number) => Math.max(0, Math.floor(time - 0.25 + 1e-8) + 1);

async function openEditor(page: Page, request: APIRequestContext) {
  await page.addInitScript(({ key, layout }) => localStorage.setItem(key, JSON.stringify(layout)), {
    key: DOCK_STORAGE_KEY, layout: dockPane(DEFAULT_DOCK_DOCUMENT, "game", "scene", "bottom"),
  });
  await page.goto("/");
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const invoke = async (operation: string, values = {}) => {
    const reply = await (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" },
      data: { version: 1, requestId: crypto.randomUUID(), sessionId, operation, ...values } })).json();
    expect(reply.status, JSON.stringify(reply)).toBe("ok"); return reply.result;
  };
  await expect.poll(async () => (await invoke("editor.status")).loaded).toBe(true);
  await page.getByRole("tab", { name: "Game", exact: true }).click(); return invoke;
}

/** Screenshot-only measurement proves skin deformation without fetching production GPU or scene transforms. */
async function leftSkinWidth(page: Page) {
  const screenshot = await page.getByLabel("Game render viewport", { exact: true }).screenshot({ path: "/tmp/braze-runtime-skin-measurement.png" });
  return page.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let min = image.width, max = -1;
    for (let y = Math.floor(image.height * 0.12); y < image.height * 0.85; y++) for (let x = Math.floor(image.width * 0.08); x < image.width * 0.49; x++) {
      const offset = (y * image.width + x) * 4, r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      if (r > 70 && r > g * 1.15 && g > b * 1.6) { min = Math.min(min, x); max = Math.max(max, x); }
    }
    return max < min ? 0 : max - min + 1;
  }, screenshot.toString("base64"));
}

test("editor: Stop cancels an animated prefab load without publishing a late actor", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  const invoke = await openEditor(page, request);
  let release!: () => void, intercepted!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const requested = new Promise<void>((resolve) => { intercepted = resolve; });
  await page.route("**/3d-models/Runtime%20Skin.gltf*", async (route) => {
    const response = await route.fetch(); intercepted(); await held;
    await route.fulfill({ response });
  });
  try {
    await invoke("editor.transport", { action: "play" }); await expect(panel(page)).toContainText("Active: true");
    await panel(page).getByRole("button", { name: "Spawn skin", exact: true }).click();
    await requested; await expect(panel(page)).toContainText("Pending: preparing");
    await invoke("editor.transport", { action: "stop" }); await expect(panel(page)).toContainText("Active: false");
    release(); await gap(page);
    expect(await page.evaluate(() => window.runtimeAnimationProbe.context!.world.stats())).toMatchObject({ ended: true, runtime: 0 });
    await page.unroute("**/3d-models/Runtime%20Skin.gltf*");
    await invoke("editor.transport", { action: "play" }); await expect(panel(page)).toContainText("Active: true");
    await expect(panel(page)).toContainText("Instances: 0");
    await panel(page).getByRole("button", { name: "Spawn skin", exact: true }).click(); await expect(panel(page)).toContainText("Instances: 1");
    await expect.poll(async () => (await sample(page))[0]?.snapshot?.layers[0]?.stateTimeSeconds ?? 0).toBeGreaterThan(0.05);
    await invoke("editor.transport", { action: "stop" }); expect(errors).toEqual([]);
  } finally { release(); }
});

for (const player of [false, true]) test(`${player ? "player" : "editor"}: independent skinned prefab clocks, events, pooling and lifetime`, async ({ page, request }) => {
  const errors: string[] = [], apis: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  if (player) page.on("request", (req) => { if (/^\/(api|__braze)\//.test(new URL(req.url()).pathname)) apis.push(req.url()); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  let invoke: Awaited<ReturnType<typeof openEditor>> | undefined, saved: string | undefined;
  if (player) await page.goto("http://127.0.0.1:4374/player.html");
  else {
    invoke = await openEditor(page, request); await invoke("editor.save");
    saved = await (await request.get("/api/scenes/current")).text();
    expect(saved).not.toContain("ab120000000000000000000000000001");
    await invoke("editor.transport", { action: "play" });
  }
  await expect(panel(page)).toContainText("Active: true");
  const empty = await coloredPixels(page);
  for (const count of [1, 2]) {
    await panel(page).getByRole("button", { name: "Spawn skin", exact: true }).click(); await expect(panel(page)).toContainText(`Instances: ${count}`);
    await expect.poll(async () => (await sample(page))[count - 1]?.snapshot?.layers[0]?.stateTimeSeconds ?? 0).toBeGreaterThan(0.05);
  }
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeGreaterThan(empty.orange + 150);
  if (invoke && process.env.BRAZE_RUNTIME_ANIMATION_WITH_PHYSICS) {
    await expect.poll(async () => (await invoke!("editor.status")).physics.bodyCount).toBe(2);
  }
  await expect.poll(async () => (await sample(page)).every((entry) => entry.events > 0)).toBe(true);
  await panel(page).getByRole("button", { name: "Speed first = 2", exact: true }).click();
  expect((await sample(page)).map((entry) => entry.snapshot!.parameters.speed)).toEqual([2, 1]);

  if (invoke) {
    await invoke("editor.transport", { action: "pause" }); await gap(page);
    const before = await sample(page); await gap(page); expect(await sample(page)).toEqual(before);
    for (let step = 0; step < 15; step++) {
      const tick = await page.evaluate(() => window.runtimeAnimationProbe.ticks);
      await invoke("editor.transport", { action: "step" }); await expect.poll(() => page.evaluate(() => window.runtimeAnimationProbe.ticks)).toBe(tick + 1);
    }
    const after = await sample(page);
    for (const [index, speed] of [2, 1].entries()) {
      const previousTime = before[index].snapshot!.layers[0].stateTimeSeconds, currentTime = after[index].snapshot!.layers[0].stateTimeSeconds;
      expect(currentTime - previousTime).toBeCloseTo(15 * speed / 60, 5);
      expect(after[index].events - before[index].events).toBe(markers(currentTime) - markers(previousTime));
    }
    await panel(page).getByRole("button", { name: "Hold first", exact: true }).click(); await invoke("editor.transport", { action: "step" });
    await expect.poll(async () => (await sample(page))[0].snapshot!.layers[0].currentStateId).toBe("hold");
    expect((await sample(page))[0].snapshot!.layers[0].stateTimeSeconds).toBe(0);
    for (let step = 0; step < 2; step++) {
      const tick = await page.evaluate(() => window.runtimeAnimationProbe.ticks);
      await invoke("editor.transport", { action: "step" });
      await expect.poll(() => page.evaluate(() => window.runtimeAnimationProbe.ticks)).toBe(tick + 1);
      expect((await sample(page))[0].snapshot!.layers[0].stateTimeSeconds).toBe(0);
    }
    const upright = await leftSkinWidth(page); expect(upright).toBeGreaterThan(5);
    await page.evaluate(() => window.runtimeAnimationProbe.setSpeed(0, 1));
    await panel(page).getByRole("button", { name: "Sway first", exact: true }).click(); await invoke("editor.transport", { action: "step" });
    await expect.poll(async () => (await sample(page))[0].snapshot!.layers[0].currentStateId).toBe("sway");
    for (let step = 0; step < 15; step++) {
      const time = (await sample(page))[0].snapshot!.layers[0].stateTimeSeconds;
      await invoke("editor.transport", { action: "step" }); await expect.poll(async () => (await sample(page))[0].snapshot!.layers[0].stateTimeSeconds).toBeGreaterThan(time);
    }
    await expect.poll(() => leftSkinWidth(page)).toBeGreaterThan(upright + 5);
    const held = await sample(page), width = await leftSkinWidth(page);
    await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick(); await expect(page.locator(".three-host")).toHaveCount(0);
    await gap(page); expect(await sample(page)).toEqual(held);
    await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick(); await expect(page.locator(".three-host")).toHaveCount(2);
    await gap(page); expect(await sample(page)).toEqual(held);
    // New render views prepare environment lighting asynchronously; the world
    // stays paused while their visible presentation reaches the retained pose.
    await expect.poll(() => leftSkinWidth(page)).toBeCloseTo(width, 0);
    expect(await sample(page)).toEqual(held);
    await invoke("editor.transport", { action: "play" });
  } else {
    const before = await sample(page);
    await expect.poll(async () => (await sample(page))[0].snapshot!.layers[0].stateTimeSeconds).toBeGreaterThan(before[0].snapshot!.layers[0].stateTimeSeconds + 0.5);
    const after = await sample(page), firstDelta = after[0].snapshot!.layers[0].stateTimeSeconds - before[0].snapshot!.layers[0].stateTimeSeconds;
    const secondDelta = after[1].snapshot!.layers[0].stateTimeSeconds - before[1].snapshot!.layers[0].stateTimeSeconds;
    expect(firstDelta).toBeCloseTo(secondDelta * 2, 4);
    for (const entry of after) expect(entry.events).toBe(markers(entry.snapshot!.layers[0].stateTimeSeconds));
    await panel(page).getByRole("button", { name: "Hold first", exact: true }).click();
    await expect.poll(async () => (await sample(page))[0].snapshot!.layers[0].currentStateId).toBe("hold");
    const heldEvents = (await sample(page))[0].events;
    expect((await sample(page))[0].snapshot!.layers[0].stateTimeSeconds).toBe(0);
    const holdTick = await page.evaluate(() => window.runtimeAnimationProbe.ticks);
    await expect.poll(() => page.evaluate(() => window.runtimeAnimationProbe.ticks)).toBeGreaterThan(holdTick + 2);
    expect((await sample(page))[0].events).toBe(heldEvents);
    expect((await sample(page))[0].snapshot!.layers[0].stateTimeSeconds).toBe(0);
    const upright = await leftSkinWidth(page); expect(upright).toBeGreaterThan(5);
    await page.evaluate(() => window.runtimeAnimationProbe.setSpeed(0, 1));
    await panel(page).getByRole("button", { name: "Sway first", exact: true }).click();
    await expect.poll(async () => (await sample(page))[0].snapshot!.layers[0].currentStateId).toBe("sway");
    await expect.poll(() => leftSkinWidth(page)).toBeGreaterThan(upright + 5);
  }

  await panel(page).getByRole("button", { name: "Remove last", exact: true }).click();
  await expect(panel(page)).toContainText("Instances: 1"); await panel(page).getByRole("button", { name: "Test old handle", exact: true }).click();
  await expect(panel(page)).toContainText("PASS: old animation handle rejected");
  expect(await page.evaluate(() => {
    const probe = window.runtimeAnimationProbe, handle = probe.last!.instance.entities["Animated Skin"];
    if (probe.context!.world.isAlive(handle)) return "still-alive";
    try { probe.context!.animation.snapshot(handle); return "accepted"; }
    catch (error) { return (error as { code?: string }).code; }
  })).toBe("stale-handle");
  const removedEvents = await page.evaluate(() => {
    const probe = window.runtimeAnimationProbe, handle = probe.last!.instance.entities["Animated Skin"]; return probe.events[`${handle.slot}:${handle.generation}`];
  });
  await gap(page);
  expect(await page.evaluate(() => {
    const probe = window.runtimeAnimationProbe, handle = probe.last!.instance.entities["Animated Skin"]; return probe.events[`${handle.slot}:${handle.generation}`];
  })).toBe(removedEvents);
  await panel(page).getByRole("button", { name: "Acquire skin", exact: true }).click(); await expect(panel(page)).toContainText("Instances: 2");
  await expect.poll(async () => (await sample(page))[1]?.initial?.parameters.speed).toBe(1);
  const pooled = (await sample(page))[1]; expect(pooled.initial!.layers[0].stateTimeSeconds).toBeLessThanOrEqual(1 / 60 + 1e-6);
  await page.evaluate(() => { window.runtimeAnimationProbe.setSpeed(1, 3); window.runtimeAnimationProbe.setActive(1, false); });
  await expect.poll(async () => (await sample(page))[1].snapshot!.layers[0].currentStateId).toBe("hold");
  await panel(page).getByRole("button", { name: "Remove last", exact: true }).click(); await expect(panel(page)).toContainText("Instances: 1");
  await expect.poll(() => page.evaluate(() => window.runtimeAnimationProbe.pool!.stats().available)).toBe(1);
  await panel(page).getByRole("button", { name: "Acquire skin", exact: true }).click(); await expect(panel(page)).toContainText("Instances: 2");
  await expect.poll(async () => (await sample(page))[1]?.initial?.parameters.speed).toBe(1);
  const reacquired = (await sample(page))[1];
  expect(reacquired.handle.slot).toBe(pooled.handle.slot); expect(reacquired.handle.generation).toBeGreaterThan(pooled.handle.generation);
  expect(reacquired.initial!.parameters).toEqual({ speed: 1, active: true }); expect(reacquired.initial!.layers[0].currentStateId).toBe("sway");
  expect(reacquired.initial!.layers[0].stateTimeSeconds).toBeLessThanOrEqual(1 / 60 + 1e-6);
  expect(await page.evaluate(() => window.runtimeAnimationProbe.duplicates)).toBe(0);
  await page.screenshot({ path: `/tmp/braze-runtime-animation-${player ? "player" : "editor"}-${process.env.BRAZE_RUNTIME_ANIMATION_WITH_PHYSICS ? "physics" : "render"}.png` });
  await panel(page).getByRole("button", { name: "Remove last", exact: true }).click(); await expect(panel(page)).toContainText("Instances: 1");
  await expect.poll(() => page.evaluate(() => window.runtimeAnimationProbe.pool!.stats().available)).toBe(1);
  await panel(page).getByRole("button", { name: "Dispose pool", exact: true }).click(); await expect(panel(page)).toContainText("Pool disposed");
  if (invoke) {
    await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick(); await expect(page.locator(".three-host")).toHaveCount(0);
    await invoke("editor.transport", { action: "stop" }); await expect(panel(page)).toContainText("Active: false");
    expect(await page.evaluate(() => window.runtimeAnimationProbe.context!.world.stats().ended)).toBe(true);
    await expect.poll(async () => (await invoke!("editor.status")).dirty).toBe(false);
    expect(await (await request.get("/api/scenes/current")).text()).toBe(saved);
    await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick();
    await invoke("editor.transport", { action: "play" }); await expect(panel(page)).toContainText("Instances: 0");
    await invoke("editor.transport", { action: "stop" });
  }
  expect(errors).toEqual([]); expect(apis).toEqual([]);
});
