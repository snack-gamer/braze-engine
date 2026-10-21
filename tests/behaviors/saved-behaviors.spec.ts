import { expect, test, type APIRequestContext, type Page } from "playwright/test";
import type { GameContext, PrefabBatch, PrefabPool } from "../../src/gameplay/public";
import type { SavedBehaviorLife } from "../gameplay/fixtures/saved-behavior";
import { PREFAB_REVIEW_FILE } from "../gameplay/prefab-fixture.mjs";

declare global {
  interface Window {
    savedBehaviorProbe: { lives: SavedBehaviorLife[] };
    savedBehaviorTest: { pool: PrefabPool; tickets: PrefabBatch[] };
    gameplayProbe: { context: GameContext | null; ticks: number };
  }
}
async function editor(page: Page, request: APIRequestContext) {
  const capabilities = await (await request.get("/api/automation/v1/capabilities")).json();
  expect(capabilities.components).toContain("behaviors");
  await page.goto("/");
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const invoke = async (operation: string, values = {}) => {
    const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
    const reply = await (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" },
      data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values } })).json();
    expect(reply.status, JSON.stringify(reply)).toBe("ok"); return reply.result;
  };
  await expect.poll(async () => (await invoke("editor.status")).loaded).toBe(true);
  return invoke;
}
const lives = (page: Page) => page.evaluate(() => window.savedBehaviorProbe?.lives ?? []);

for (const player of [false, true]) test(`saved behaviors activate automatically with isolated prefab references in ${player ? "static player" : "editor"}`, async ({ page, request }) => {
  const errors: string[] = [], apis: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  if (player) page.on("request", (value) => { if (/^\/(api|__braze)\//.test(new URL(value.url()).pathname)) apis.push(value.url()); });
  const invoke = player ? null : await editor(page, request);
  const authored = invoke ? (await invoke("editor.inspect")).items : null;
  if (player) await page.goto("http://127.0.0.1:4374/player.html");
  else { await page.getByRole("tab", { name: "Game", exact: true }).click(); await invoke!("editor.transport", { action: "play" }); }
  await expect.poll(async () => (await lives(page))?.[0]?.ticks ?? 0).toBeGreaterThan(0);
  expect((await lives(page))[0]).toMatchObject({ name: "Hero", starts: 1, targetName: "wall" });
  const first = (await lives(page))[0]; expect(first.total).toBe(first.ticks * 2);
  await page.evaluate(() => {
    const context = window.gameplayProbe.context!;
    const pool = context.prefabs.createPool(context.prefabs.list()[0].asset, { capacity: 2 });
    window.savedBehaviorTest = { pool, tickets: [pool.acquire({ position: [0, 4, 0] })] };
    // Deliberately never read the receipt until after behavior activation.
  });
  await expect.poll(async () => (await lives(page)).length).toBe(3);
  await expect.poll(async () => (await lives(page)).find((life) => life.name === "Runtime Duo")?.ticks ?? 0).toBeGreaterThan(0);
  let state = await lives(page);
  const active = state.find((life) => life.name === "Runtime Duo")!;
  expect(active).toMatchObject({ starts: 1, targetName: "Orange Box" });
  expect(active.total).toBe(active.ticks * 3);
  expect(state.find((life) => life.name === "Cyan Sphere")).toMatchObject({ ticks: 0, starts: 0, enables: 0, target: active.target });
  await page.evaluate(() => window.savedBehaviorTest.tickets.push(window.savedBehaviorTest.pool.acquire({ position: [2, 4, 0] })));
  await expect.poll(async () => (await lives(page)).length).toBe(5);
  state = await lives(page);
  const roots = state.filter((life) => life.name === "Runtime Duo");
  expect(roots[0].target).not.toBe(roots[1].target);
  const maps = await page.evaluate(() => window.savedBehaviorTest.tickets.map((ticket) => {
    const value = ticket.read(); if (value.status !== "committed") throw new Error("Expected committed receipt");
    return `${value.instance.entities.box.slot}:${value.instance.entities.box.generation}`;
  }));
  expect(roots.map((life) => life.target)).toEqual(maps);
  await page.evaluate(() => {
    const value = window.savedBehaviorTest.tickets[0].read();
    if (value.status === "committed") window.savedBehaviorTest.pool.release(value.instance);
  });
  await expect.poll(async () => (await lives(page))[1].disposed).toBe("entity-removed");
  expect((await lives(page))[1]).toMatchObject({ cleanups: 1, aborted: true });
  expect((await lives(page))[2]).toMatchObject({ disposed: "entity-removed", cleanups: 1, aborted: true });
  await expect.poll(() => page.evaluate(() => window.savedBehaviorTest.pool.stats().available)).toBe(1);
  await page.evaluate(() => window.savedBehaviorTest.tickets.push(window.savedBehaviorTest.pool.acquire()));
  await expect.poll(async () => (await lives(page)).length).toBe(7);
  expect((await lives(page))[5].owner).not.toBe(active.owner);
  expect((await lives(page))[5].starts).toBe(1);
  if (invoke) {
    await invoke("editor.transport", { action: "pause" });
    const ticks = (await lives(page))[0].ticks;
    await invoke("editor.transport", { action: "step" });
    await expect.poll(async () => (await lives(page))[0].ticks).toBe(ticks + 1);
    await invoke("editor.transport", { action: "stop" });
    expect((await lives(page)).every((life) => life.disposed && life.cleanups === 1 && life.aborted)).toBe(true);
    expect((await invoke("editor.inspect")).items).toEqual(authored);
    await expect.poll(async () => (await invoke("editor.status")).dirty).toBe(false);
    await invoke("editor.transport", { action: "play" });
    await expect.poll(async () => (await lives(page)).length).toBe(8);
    await expect.poll(async () => (await lives(page))[7].ticks).toBeGreaterThan(0);
    expect((await lives(page))[7].starts).toBe(1);
    await invoke("editor.transport", { action: "stop" });
  }
  expect(errors).toEqual([]); expect(apis).toEqual([]);
});

test("saved behavior Inspector supports typed edits, undo, reload and missing definitions", async ({ page, request }) => {
  await page.setViewportSize({ width: 1500, height: 1100 });
  const invoke = await editor(page, request);
  await invoke("editor.select", { objectId: "hero" });
  const amount = page.getByRole("spinbutton", { name: "Review Counter: Amount per tick", exact: true });
  await expect(amount).toHaveValue("2.000");
  const enabled = page.getByRole("switch", { name: "Enable behavior Review Counter", exact: true });
  await enabled.click(); await expect(enabled).not.toBeChecked();
  await invoke("editor.undo"); await expect(enabled).toBeChecked();
  await amount.fill("4"); await amount.press("Tab");
  await expect(amount).toHaveValue("4.000");
  await invoke("editor.undo"); await expect(amount).toHaveValue("2.000");
  await invoke("editor.redo"); await expect(amount).toHaveValue("4.000");
  const caption = page.getByRole("textbox", { name: "Review Counter: Caption", exact: true });
  await caption.fill("Authored counter"); await caption.press("Tab");
  await page.getByRole("combobox", { name: "Review Counter: Target", exact: true }).selectOption("floor");
  await invoke("editor.save"); await page.reload();
  await expect.poll(async () => (await invoke("editor.status")).loaded).toBe(true);
  await invoke("editor.select", { objectId: "hero" });
  await expect(amount).toHaveValue("4.000"); await expect(caption).toHaveValue("Authored counter");
  await expect(page.getByRole("combobox", { name: "Review Counter: Target", exact: true })).toHaveValue("floor");
  await amount.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/braze-saved-behaviors-inspector.png" });
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await invoke("editor.transport", { action: "play" });
  await expect.poll(async () => (await lives(page))[0]?.ticks ?? 0).toBeGreaterThan(0);
  const life = (await lives(page))[0];
  expect(life).toMatchObject({ targetName: "floor", caption: "Authored counter" });
  expect(life.total).toBe(life.ticks * 4);
  await invoke("editor.transport", { action: "stop" });
  await expect(amount).toHaveValue("4.000");
  await invoke("editor.select", { objectId: "floor" });
  await page.getByRole("button", { name: "Add Component", exact: true }).click();
  await page.getByRole("dialog", { name: "Add Component", exact: true }).getByRole("button", { name: "Behaviors", exact: true }).click();
  await page.getByRole("combobox", { name: "Behavior definition", exact: true }).selectOption("review.counter");
  await page.getByRole("button", { name: "Add behavior", exact: true }).click();
  await expect(amount).toHaveValue("1.000");
  await page.getByRole("button", { name: "Remove behavior Review Counter", exact: true }).click();
  await expect(amount).toHaveCount(0);
  const inspection = await invoke("editor.inspect");
  const unknown = { version: 1, entries: [{ id: "missing", type: "missing.behavior", typeVersion: 8, enabled: true, values: { keep: "preserved" } }] };
  await invoke("editor.edit", { baseRevision: inspection.revision, apply: true, commands: [
    { op: "component.set", id: "floor", component: "behaviors", values: unknown },
  ] });
  await invoke("editor.select", { objectId: "floor" });
  await expect(page.getByText(/missing.behavior/).first()).toBeVisible();
  await invoke("editor.save"); await page.reload();
  await expect.poll(async () => (await invoke("editor.status")).loaded).toBe(true);
  const saved = (await invoke("editor.inspect")).items.find((item: { id: string }) => item.id === "floor");
  expect(saved.behaviors).toEqual(unknown);
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await invoke("editor.transport", { action: "play" });
  await expect.poll(() => page.evaluate(() => window.gameplayProbe.ticks)).toBeGreaterThan(1);
  await expect.poll(() => errors.some((line) => line.includes("missing.behavior"))).toBe(true);
  expect(errors).toHaveLength(1);
  await invoke("editor.transport", { action: "stop" });
  await invoke("editor.edit", { baseRevision: (await invoke("editor.status")).revision, apply: true,
    commands: [{ op: "component.remove", id: "floor", component: "behaviors" }] });
  await invoke("editor.save");
});

test("prefab Inspector settings save and automatically reach fresh runtime instances", async ({ page, request }) => {
  await page.setViewportSize({ width: 1500, height: 1100 });
  const invoke = await editor(page, request);
  const endpoint = `/api/assets/prefab?filename=${encodeURIComponent(PREFAB_REVIEW_FILE)}`;
  const original = await (await request.get(endpoint)).json();
  try {
    await page.getByRole("button", { name: "All Prefabs", exact: true }).click();
    await page.locator(".prefab-tile").filter({ hasText: "Runtime Duo" }).click();
    await page.getByRole("button", { name: "Edit prefab", exact: true }).click();
    const mode = page.getByRole("status", { name: "Prefab edit mode" }); await expect(mode).toBeVisible();
    await page.locator(".object-row .object-name").filter({ hasText: /^Runtime Duo$/ }).first().click();
    const amount = page.getByRole("spinbutton", { name: "Review Counter: Amount per tick", exact: true });
    await expect(amount).toHaveValue("3.000");
    await amount.fill("5"); await amount.press("Tab");
    expect((await (await request.get(endpoint)).json()).revision).toBe(original.revision);
    await mode.getByRole("button", { name: "Save", exact: true }).click();
    await expect(mode.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
    const saved = await (await request.get(endpoint)).json();
    expect(saved.prefab.objects[0].behaviors.entries[0].values.amount).toBe(5);
    expect(saved.prefab.objects[0].behaviors.entries[0].values.target).toEqual({ entityId: "box" });
    await mode.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("tab", { name: "Game", exact: true }).click();
    await invoke("editor.transport", { action: "play" });
    await expect.poll(() => page.evaluate(() => window.gameplayProbe.ticks)).toBeGreaterThan(0);
    await page.evaluate(() => {
      const prefabs = window.gameplayProbe.context!.prefabs;
      prefabs.instantiate(prefabs.list()[0].asset, { position: [0, 4, 0] });
    });
    await expect.poll(async () => (await lives(page)).find((life) => life.name === "Runtime Duo")?.ticks ?? 0).toBeGreaterThan(0);
    const life = (await lives(page)).find((entry) => entry.name === "Runtime Duo")!;
    expect(life.total).toBe(life.ticks * 5); expect(life.targetName).toBe("Orange Box");
    await invoke("editor.transport", { action: "stop" });
  } finally {
    const current = await (await request.get(endpoint)).json();
    await request.put(endpoint, { data: { prefab: original.prefab, name: original.prefab.name, baseRevision: current.revision } });
  }
});
