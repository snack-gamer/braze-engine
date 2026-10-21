import { expect, test, type Page } from "playwright/test";
import type { GameContext } from "../../src/gameplay/public";

declare global {
  interface Window { gameplayProbe: {
    context: GameContext; lookTotal: number; failNext: boolean; pointerLockError?: string;
    lastTickIndex: number; walkRequested: boolean; walkTicks: number; walkDistance: number;
  } }
}

async function state(page: Page) {
  return page.evaluate(() => {
    const probe = (window as unknown as { gameplayProbe?: { creates: number; disposes: number; ticks: number; position: number[]; grounded: boolean; context: { signal: AbortSignal } } }).gameplayProbe;
    return probe ? { creates: probe.creates, disposes: probe.disposes, ticks: probe.ticks, position: [...probe.position], grounded: probe.grounded, aborted: probe.context?.signal.aborted ?? false } : null;
  });
}

async function checkMovementKeys(page: Page) {
  await page.getByLabel("Game render viewport", { exact: true }).click();
  const bindings: Array<[string, number, number]> = [
    ["KeyW", 2, -1], ["KeyS", 2, 1], ["KeyA", 0, -1], ["KeyD", 0, 1],
    ["ArrowUp", 2, -1], ["ArrowDown", 2, 1], ["ArrowLeft", 0, -1], ["ArrowRight", 0, 1],
  ];
  for (const [key, axis, direction] of bindings) {
    const before = (await state(page))!.position[axis];
    await page.keyboard.down(key);
    try {
      await expect.poll(async () => ((await state(page))!.position[axis] - before) * direction).toBeGreaterThan(0.1);
    } finally { await page.keyboard.up(key); }
  }
}

async function moveAndJump(page: Page) {
  const surface = page.getByLabel("Game render viewport", { exact: true });
  await surface.click();
  await page.keyboard.down("KeyD");
  await expect.poll(async () => (await state(page))?.position[0] ?? 0).toBeGreaterThan(1);
  await expect.poll(async () => (await state(page))?.position[0] ?? 0).toBeGreaterThan(2.45);
  await page.keyboard.up("KeyD");
  expect((await state(page))!.position[0]).toBeLessThan(2.6);
  await expect.poll(async () => (await state(page))?.grounded).toBe(true);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await state(page))?.position[1] ?? 0).toBeGreaterThan(0.2);
  await expect.poll(async () => (await state(page))?.grounded).toBe(true);

  // A UI field inside the same surface must release gameplay focus and held keys.
  await page.evaluate(() => {
    const field = document.createElement("input"); field.id = "typing";
    field.style.cssText = "position:absolute;top:8px;left:8px;z-index:10;";
    document.querySelector(".three-host--game")!.append(field); field.focus();
  });
  await page.locator("#typing").click();
  await expect(page.locator("#typing")).toBeFocused();
  const stopped = (await state(page))!.position[0], before = (await state(page))!.ticks;
  await page.keyboard.down("KeyA");
  await expect.poll(async () => (await state(page))!.ticks).toBeGreaterThan(before + 5);
  await page.keyboard.up("KeyA");
  expect((await state(page))!.position[0]).toBeCloseTo(stopped, 6);
  await page.locator("#typing").evaluate((node) => node.remove());
}

test("project module runs once in editor Game Play with input, Pause/Step/Stop and a clean restart", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const invoke = async (operation: string, values = {}) => (await request.post("/api/automation/v1/commands", {
    headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values },
  })).json();
  await expect.poll(async () => (await invoke("editor.status")).result?.loaded).toBe(true);
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  expect(await state(page)).toBe(null);
  await invoke("editor.transport", { action: "play" });
  await expect.poll(async () => (await state(page))?.ticks ?? 0).toBeGreaterThan(2);
  expect((await state(page))!.creates).toBe(1);
  await moveAndJump(page);
  const beforeSwitch = (await state(page))!;
  await page.evaluate(() => window.gameplayProbe.context.input.rebind("move", [
    { device: "keyboard", code: "KeyQ", scale: -1 },
  ]));
  await page.getByRole("tab", { name: "Scene", exact: true }).click();
  await expect(page.getByLabel("Game render viewport", { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await state(page))!.ticks).toBeGreaterThan(beforeSwitch.ticks + 3);
  expect((await state(page))!.creates).toBe(1);
  expect((await state(page))!.disposes).toBe(0);
  expect((await state(page))!.position[0]).toBeCloseTo(beforeSwitch.position[0], 6);
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await page.getByLabel("Game render viewport", { exact: true }).click();
  await page.keyboard.down("KeyQ");
  await expect.poll(async () => (await state(page))!.position[0]).toBeLessThan(beforeSwitch.position[0] - 0.25);
  // Detaching the surface clears a held key even before its keyup is delivered.
  await page.getByRole("tab", { name: "Scene", exact: true }).click();
  const detached = (await state(page))!;
  await expect.poll(async () => (await state(page))!.ticks).toBeGreaterThan(detached.ticks + 3);
  expect((await state(page))!.position[0]).toBeCloseTo(detached.position[0], 6);
  await page.keyboard.up("KeyQ");
  await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick();
  await expect(page.locator(".three-host")).toHaveCount(0);
  const hidden = (await state(page))!;
  await expect.poll(async () => (await invoke("editor.status")).result?.physics?.simulationPending).toBe(false);
  const hiddenPhysicsTick = (await invoke("editor.status")).result.physics.completedStepId;
  await page.evaluate(async () => {
    for (let frame = 0; frame < 12; frame += 1) await new Promise(requestAnimationFrame);
  });
  expect((await state(page))!.ticks).toBe(hidden.ticks);
  expect((await state(page))!.aborted).toBe(false);
  expect((await invoke("editor.status")).result.physics.completedStepId).toBe(hiddenPhysicsTick);
  await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick();
  await expect.poll(async () => (await state(page))!.ticks).toBeGreaterThan(hidden.ticks);
  expect((await state(page))!.creates).toBe(1);
  await invoke("editor.transport", { action: "pause" });
  const paused = (await state(page))!.ticks;
  const physicsAtPause = (await invoke("editor.status")).result.physics.submittedStepId;
  expect(await page.evaluate(() => window.gameplayProbe.lastTickIndex)).toBe(physicsAtPause);
  await invoke("editor.transport", { action: "step" });
  await expect.poll(async () => (await state(page))!.ticks).toBe(paused + 1);
  expect((await invoke("editor.status")).result.physics.submittedStepId).toBe(physicsAtPause + 1);
  // Maximizing Hierarchy detaches both render views. Stop still reaches Play.
  await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick();
  await expect(page.locator(".three-host")).toHaveCount(0);
  await invoke("editor.transport", { action: "stop" });
  await expect.poll(async () => (await state(page))!.disposes).toBe(1);
  expect((await state(page))!.aborted).toBe(true);
  expect(await page.evaluate(() => {
    try { window.gameplayProbe.context.characters.move("hero", [1, 0, 0]); return "accepted"; }
    catch (error) { return String(error); }
  })).toContain("session has ended");
  const hero = (await invoke("editor.inspect")).result.items.find((object: { id: string }) => object.id === "hero");
  expect(hero.transform.position).toEqual([0, 0, 0]);
  await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick();
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await invoke("editor.transport", { action: "play" });
  await expect.poll(async () => (await state(page))!.creates).toBe(2);
  await expect.poll(async () => (await state(page))!.position[0]).toBeCloseTo(0, 6);
  await page.evaluate(() => { window.gameplayProbe.failNext = true; });
  await expect(page.getByRole("alert").filter({ hasText: "Game logic stopped" })).toContainText("Controlled gameplay regression failure");
  await expect.poll(async () => (await state(page))!.disposes).toBe(2);
  expect((await state(page))!.aborted).toBe(true);
  const failedTick = (await invoke("editor.status")).result.physics.submittedStepId;
  await page.evaluate(async () => { for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame); });
  expect((await invoke("editor.status")).result.physics.submittedStepId).toBe(failedTick);
  await invoke("editor.transport", { action: "stop" });
  expect(errors).toEqual([]);
});

test("the repeatable walk takes 120 physics ticks, including single steps while paused", async ({ page, request }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const invoke = async (operation: string, values = {}) => (await request.post("/api/automation/v1/commands", {
    headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values },
  })).json();
  await expect.poll(async () => (await invoke("editor.status")).result?.loaded).toBe(true);
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await invoke("editor.transport", { action: "play" });
  await expect.poll(async () => (await state(page))?.ticks ?? 0).toBeGreaterThan(2);
  await invoke("editor.transport", { action: "pause" });
  await page.evaluate(() => { window.gameplayProbe.walkRequested = true; });
  const start = (await invoke("editor.status")).result.physics.submittedStepId;
  for (let i = 1; i <= 3; i++) {
    await invoke("editor.transport", { action: "step" });
    await expect.poll(() => page.evaluate(() => window.gameplayProbe.walkTicks)).toBe(i);
    expect(await page.evaluate(() => window.gameplayProbe.walkDistance)).toBeCloseTo(i * 0.05, 6);
    expect((await invoke("editor.status")).result.physics.submittedStepId).toBe(start + i);
  }
  await invoke("editor.transport", { action: "play" });
  await expect.poll(() => page.evaluate(() => window.gameplayProbe.walkTicks)).toBe(120);
  await invoke("editor.transport", { action: "pause" });
  expect(await page.evaluate(() => window.gameplayProbe.walkDistance)).toBeCloseTo(6, 6);
  expect(await page.evaluate(() => window.gameplayProbe.lastTickIndex)).toBe((await invoke("editor.status")).result.physics.submittedStepId);
  await invoke("editor.transport", { action: "play" });
  await checkMovementKeys(page); // Manual input returns after the scripted walk.
  await invoke("editor.transport", { action: "stop" });
});

test("static player compiles and runs the same project gameplay without editor APIs", async ({ page }) => {
  const apiRequests: string[] = [], errors: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4374/player.html");
  await expect.poll(async () => (await state(page))?.ticks ?? 0).toBeGreaterThan(2);
  await checkMovementKeys(page);
  await moveAndJump(page);
  const viewport = page.getByLabel("Game render viewport", { exact: true });
  await viewport.click();
  const beforePad = (await state(page))!.position[0];
  await page.evaluate(() => {
    window.gameplayProbe.context.input.rebind("move", [{ device: "gamepad-axis", axis: 0 }]);
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [{ connected: true, axes: [-1], buttons: [] }] });
  });
  await expect.poll(async () => (await state(page))!.position[0]).toBeLessThan(beforePad - 0.5);
  await page.evaluate(() => Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] }));
  const disconnected = await state(page);
  await expect.poll(async () => (await state(page))!.ticks).toBeGreaterThan(disconnected!.ticks + 5);
  expect((await state(page))!.position[0]).toBeCloseTo(disconnected!.position[0], 6);

  await viewport.evaluate((surface) => surface.addEventListener("click", () => {
    void window.gameplayProbe.context.input.requestPointerLock().catch((error) => { window.gameplayProbe.pointerLockError = String(error); });
  }, { once: true }));
  await viewport.click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement) || window.gameplayProbe.pointerLockError)).toBeTruthy();
  const lockError = await page.evaluate(() => window.gameplayProbe.pointerLockError);
  if (lockError) {
    // Headless macOS Chrome rejects native pointer lock, including in an isolated
    // one-button reproduction. Keep its explicit failure visible, then exercise
    // success/disposal through a controlled browser port instead of skipping it.
    expect(lockError).toMatch(/WrongDocumentError|NotAllowedError/);
    test.info().annotations.push({ type: "native-pointer-lock-unavailable", description: lockError });
    await viewport.evaluate((element) => {
      let locked: Element | null = null;
      Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => locked });
      Object.defineProperty(element, "requestPointerLock", { configurable: true, value: async () => {
        locked = element; document.dispatchEvent(new Event("pointerlockchange"));
      } });
      Object.defineProperty(document, "exitPointerLock", { configurable: true, value: () => {
        locked = null; document.dispatchEvent(new Event("pointerlockchange"));
      } });
    });
    await page.evaluate(() => window.gameplayProbe.context.input.requestPointerLock());
  }
  await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointermove", { movementX: 12, movementY: 0 })));
  await expect.poll(() => page.evaluate(() => window.gameplayProbe.lookTotal)).toBeGreaterThan(0);
  await page.evaluate(() => window.gameplayProbe.context.input.releasePointerLock());
  await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
  expect((await state(page))!.creates).toBe(1);
  expect(apiRequests).toEqual([]); expect(errors).toEqual([]);
});
