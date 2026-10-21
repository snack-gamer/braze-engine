import { expect, test, type Page } from "playwright/test";
import { DEFAULT_DOCK_DOCUMENT, dockPane } from "../../src/docking/layout";
import { DOCK_STORAGE_KEY } from "../../src/docking/dock-persistence";
import type {} from "../gameplay/fixtures/animation-game";
const gap = (page: Page) => page.evaluate(async () => { for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame); });
const snapshot = (page: Page) => page.evaluate(() => Object.fromEntries(["normal", "fixedStep", "unscaledTime"].map((id) => [id, window.animationProbe.snapshot(id)])));

for (const player of [false, true]) test(`${player ? "player" : "editor"}: one animation world, transport, events and destruction`, async ({ page, request }) => {
  const errors: string[] = [], apis: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  if (!player) await page.addInitScript(({ key, layout }) => localStorage.setItem(key, JSON.stringify(layout)), { key: DOCK_STORAGE_KEY, layout: dockPane(DEFAULT_DOCK_DOCUMENT, "game", "inspector", "center") });
  else page.on("request", (req) => { if (/^\/(api|__braze)\//.test(new URL(req.url()).pathname)) apis.push(req.url()); });
  await page.goto(player ? "http://127.0.0.1:4374/player.html" : "/");
  let authored: unknown, savedDocument: string;
  const invoke = async (operation: string, values = {}) => {
    const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
    const reply = await (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), sessionId, operation, ...values } })).json();
    expect(reply.status, JSON.stringify(reply)).toBe("ok"); return reply.result;
  };
  if (!player) {
    await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
    await expect.poll(async () => (await invoke("editor.status")).loaded).toBe(true);
    await page.getByRole("tab", { name: "Game", exact: true }).click();
    await expect(page.locator(".three-host")).toHaveCount(2);
    await gap(page);
    await invoke("editor.save");
    await expect.poll(async () => (await invoke("editor.status")).dirty).toBe(false);
    savedDocument = await (await request.get("/api/scenes/current")).text();
    authored = (await invoke("editor.inspect")).items;
    await invoke("editor.transport", { action: "play" });
  }
  const panel = page.getByRole("complementary", { name: "World animation review" });
  await expect(panel).toContainText("Active: true");
  await expect.poll(async () => Object.values(await snapshot(page)).every((state) => state && state.layers[0]!.stateTimeSeconds > 0.1)).toBe(true);
  await expect.poll(() => page.evaluate(() => Object.values(window.animationProbe.events).length)).toBe(3);
  if (!player) {
    await invoke("editor.transport", { action: "pause" }); await gap(page);
    const before = await snapshot(page), events = await page.evaluate(() => window.animationProbe.events);
    await gap(page); expect(await snapshot(page)).toEqual(before);
    await invoke("editor.transport", { action: "step" });
    await expect.poll(async () => (await snapshot(page)).fixedStep!.layers[0]!.stateTimeSeconds).toBeGreaterThan(before.fixedStep!.layers[0]!.stateTimeSeconds);
    const after = await snapshot(page);
    for (const id of Object.keys(before)) expect(after[id]!.layers[0]!.stateTimeSeconds - before[id]!.layers[0]!.stateTimeSeconds).toBeCloseTo(1 / 60, 5);
    await panel.getByRole("button", { name: "Set Speed = 2", exact: true }).click();
    const held = await snapshot(page);
    await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick();
    await expect(page.locator(".three-host")).toHaveCount(0);
    await gap(page); expect(await snapshot(page)).toEqual(held);
    await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick();
    await expect(page.locator(".three-host")).toHaveCount(2);
    await gap(page); expect(await snapshot(page)).toEqual(held);
    expect((await snapshot(page)).normal!.parameters.speed).toBe(2);
    expect(await page.evaluate(() => window.animationProbe.duplicates)).toBe(0);
    expect(await page.evaluate(() => window.animationProbe.events.normal)).toBeGreaterThanOrEqual(events.normal!);
    await invoke("editor.transport", { action: "play" });
  }
  const prior = await snapshot(page);
  await expect.poll(async () => (await snapshot(page)).normal!.layers[0]!.stateTimeSeconds).toBeGreaterThan(prior.normal!.layers[0]!.stateTimeSeconds);
  await panel.getByRole("button", { name: "Log state", exact: true }).click();
  await page.screenshot({ path: `/tmp/braze-step10-${player ? "player" : "editor"}.png` });
  await panel.getByRole("button", { name: "Destroy Normal", exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).normal).toBeNull();
  const count = await page.evaluate(() => window.animationProbe.events.normal);
  await gap(page); expect(await page.evaluate(() => window.animationProbe.events.normal)).toBe(count);
  expect(await page.evaluate(() => window.animationProbe.duplicates)).toBe(0);
  if (!player) {
    await invoke("editor.transport", { action: "stop" }); await expect(panel).toContainText("Active: false");
    await expect.poll(async () => (await invoke("editor.inspect")).items).toEqual(authored);
    // Restore triggers a debounced authored comparison; it must settle without a disk write.
    await expect.poll(async () => (await invoke("editor.status")).dirty).toBe(false);
    expect(await (await request.get("/api/scenes/current")).text()).toEqual(savedDocument!);
    await invoke("editor.transport", { action: "play" });
    await expect.poll(async () => (await snapshot(page)).normal?.parameters.speed).toBe(1);
    await invoke("editor.transport", { action: "stop" });
  }
  expect(errors).toEqual([]); expect(apis).toEqual([]);
});
