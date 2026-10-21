import { expect, test, type Page } from "playwright/test";
import { coloredPixels } from "./colored-pixels";

const panel = (page: Page) => page.getByRole("complementary", { name: "Runtime spawning review" });
const stats = (page: Page) => page.evaluate(() => window.gameplayProbe.context.world.stats());


test("spawned bodies draw, fall, survive view replacement and disappear without authored mutations", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?spawnReview");
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const invoke = async (operation: string, values = {}) => (await request.post("/api/automation/v1/commands", {
    headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values },
  })).json();
  await expect.poll(async () => (await invoke("editor.status")).result?.loaded).toBe(true);
  const authored = (await invoke("editor.inspect")).result.items;
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await invoke("editor.transport", { action: "play" }); await expect(panel(page)).toContainText("Active: true");
  await invoke("editor.transport", { action: "pause" });
  const initialBodies = (await invoke("editor.status")).result.physics.bodyCount;
  const initialTick = (await invoke("editor.status")).result.physics.submittedStepId;
  const empty = await coloredPixels(page);
  await panel(page).getByRole("button", { name: "Spawn box", exact: true }).click();
  expect((await stats(page)).runtime).toBe(0);
  await invoke("editor.transport", { action: "step" });
  await expect.poll(async () => (await stats(page)).runtime).toBe(1);
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeGreaterThan(empty.orange + 100);
  const high = await coloredPixels(page);
  expect((await invoke("editor.status")).result.physics.submittedStepId).toBe(initialTick + 1);
  expect((await invoke("editor.status")).result.physics.bodyCount).toBe(initialBodies + 1);
  await invoke("editor.transport", { action: "play" });
  await expect.poll(() => page.evaluate(() => window.gameplayProbe.lastTickIndex)).toBeGreaterThan(initialTick + 60);
  await invoke("editor.transport", { action: "pause" });
  await expect.poll(async () => (await coloredPixels(page)).orangeY).toBeGreaterThan(high.orangeY + 20);
  await page.getByRole("tab", { name: "Scene", exact: true }).click();
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeGreaterThan(100);
  expect((await stats(page)).runtime).toBe(1);
  await panel(page).getByRole("button", { name: "Spawn sphere", exact: true }).click();
  await invoke("editor.transport", { action: "step" });
  await expect.poll(async () => (await coloredPixels(page)).cyan).toBeGreaterThan(empty.cyan + 100);
  await panel(page).getByRole("button", { name: "Test atomic rejection", exact: true }).click();
  await invoke("editor.transport", { action: "step" }); await expect(panel(page)).toContainText("Batch rejected");
  expect((await stats(page)).runtime).toBe(2);
  await panel(page).getByRole("button", { name: "Remove all", exact: true }).click();
  await invoke("editor.transport", { action: "step" });
  await expect.poll(async () => (await stats(page)).runtime).toBe(0);
  await expect.poll(async () => (await stats(page)).retiring).toBe(0);
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeLessThan(empty.orange + 30);
  await expect.poll(async () => (await coloredPixels(page)).cyan).toBeLessThan(empty.cyan + 30);
  await panel(page).getByRole("button", { name: "Check old handle", exact: true }).click(); await expect(panel(page)).toContainText("stale-handle");
  await panel(page).getByRole("button", { name: "Spawn box", exact: true }).click(); await invoke("editor.transport", { action: "step" });
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeGreaterThan(100);
  await invoke("editor.transport", { action: "stop" });
  expect((await invoke("editor.inspect")).result.items).toEqual(authored);
  await invoke("editor.transport", { action: "play" }); await expect(panel(page)).toContainText("Active: true");
  expect((await stats(page)).runtime).toBe(0);
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeLessThan(empty.orange + 30);
  await invoke("editor.transport", { action: "stop" }); expect(errors).toEqual([]);
});

test("static player spawns and removes the same visible bodies without editor services", async ({ page }) => {
  const apis: string[] = [], errors: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apis.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("http://127.0.0.1:4374/player.html?spawnReview"); await expect(panel(page)).toContainText("Active: true");
  const empty = await coloredPixels(page);
  await panel(page).getByRole("button", { name: "Spawn box", exact: true }).click();
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeGreaterThan(empty.orange + 100);
  await panel(page).getByRole("button", { name: "Remove last", exact: true }).click();
  await expect.poll(async () => (await stats(page)).runtime).toBe(0);
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeLessThan(empty.orange + 30);
  expect(apis).toEqual([]); expect(errors).toEqual([]);
});
