import { expect, test, type Page, type APIRequestContext } from "playwright/test";
import { coloredPixels } from "./colored-pixels";
import { PREFAB_REVIEW_FILE } from "./prefab-fixture.mjs";

const panel = (page: Page) => page.getByRole("complementary", { name: "Runtime prefab review" });
const stats = (page: Page) => page.evaluate(() => window.gameplayProbe.context.world.stats());
async function editor(page: Page, request: APIRequestContext) {
  await page.goto("/?prefabReview");
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const invoke = async (operation: string, values = {}) => (await request.post("/api/automation/v1/commands", {
    headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values },
  })).json();
  await expect.poll(async () => (await invoke("editor.status")).result?.loaded).toBe(true);
  return (action: string) => invoke("editor.transport", { action });
}

test("prefab graphs spawn atomically, retain independent instances and reset on Stop", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const transport = await editor(page, request);
  await page.getByRole("tab", { name: "Game", exact: true }).click(); await transport("play");
  await expect(panel(page)).toContainText("Active: true"); await transport("pause");
  const empty = await coloredPixels(page);
  await panel(page).getByRole("button", { name: "Spawn prefab", exact: true }).click();
  expect((await stats(page)).runtime).toBe(0); await transport("step");
  await expect(panel(page)).toContainText("Instances: 1"); expect((await stats(page)).runtime).toBe(4);
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeGreaterThan(empty.orange + 100);
  await expect.poll(async () => (await coloredPixels(page)).cyan).toBeGreaterThan(empty.cyan + 100);
  await expect(panel(page)).toContainText("group #");
  await panel(page).getByRole("button", { name: "Spawn prefab", exact: true }).click(); await transport("step");
  await expect(panel(page)).toContainText("Instances: 2"); expect((await stats(page)).runtime).toBe(8);
  await panel(page).getByRole("button", { name: "Remove instance", exact: true }).click(); await transport("step");
  await expect(panel(page)).toContainText("Instances: 1"); expect((await stats(page)).runtime).toBe(4);
  await panel(page).getByRole("button", { name: "Check old instance", exact: true }).click(); await expect(panel(page)).toContainText("Old instance is stale.");
  await panel(page).getByRole("button", { name: "Test missing asset", exact: true }).click(); await expect(panel(page)).toContainText("missing-asset");
  expect((await stats(page)).runtime).toBe(4);
  await page.getByRole("tab", { name: "Scene", exact: true }).click(); await page.getByRole("tab", { name: "Game", exact: true }).click();
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeGreaterThan(100);
  await transport("stop"); await transport("play"); await expect(panel(page)).toContainText("Active: true");
  expect((await stats(page)).runtime).toBe(0); await expect(panel(page)).toContainText("Instances: 0");
  await transport("stop"); expect(errors).toEqual([]);
});

test("saved edits from the prefab tool appear in the next Play snapshot", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const transport = await editor(page, request);
  const endpoint = `/api/assets/prefab?filename=${encodeURIComponent(PREFAB_REVIEW_FILE)}`;
  const original = await (await request.get(endpoint)).json();
  try {
    await page.getByRole("button", { name: "All Prefabs", exact: true }).click();
    await page.locator(".prefab-tile").filter({ hasText: "Runtime Duo" }).click();
    await page.getByRole("button", { name: "Edit prefab", exact: true }).click();
    const mode = page.getByRole("status", { name: "Prefab edit mode" }); await expect(mode).toBeVisible();
    await page.locator(".object-row").filter({ hasText: "Orange Box" }).click();
    const scale = page.getByRole("spinbutton", { name: "Scale X", exact: true });
    await scale.fill("0.8"); await scale.press("Enter");
    expect((await (await request.get(endpoint)).json()).revision).toBe(original.revision);
    await mode.getByRole("button", { name: "Save", exact: true }).click();
    await expect(mode.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
    const saved = await (await request.get(endpoint)).json(); expect(saved.prefab.objects.find((node: { id: string }) => node.id === "box").scale[0]).toBe(0.8);
    await mode.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("tab", { name: "Game", exact: true }).click(); await transport("play"); await expect(panel(page)).toContainText("Active: true");
    await page.evaluate(() => { Object.assign(window, { prefabTicket: window.gameplayProbe.context.prefabs.instantiate(window.gameplayProbe.context.prefabs.list()[0].asset) }); });
    await expect.poll(() => page.evaluate(() => (window as any).prefabTicket.read().status)).toBe("committed");
    const width = await page.evaluate(() => {
      const instance = (window as any).prefabTicket.read().instance;
      return (window.gameplayProbe.context.world.inspect(instance.entities.box).primitive!.shape as { size: number[] }).size[0];
    });
    expect(width).toBeCloseTo(1.12, 6);
    await transport("stop");
    expect(errors).toEqual([]);
  } finally {
    const current = await (await request.get(endpoint)).json();
    await request.put(endpoint, { data: { prefab: original.prefab, name: original.prefab.name, baseRevision: current.revision } });
  }
});

test("the standalone player bundles saved prefabs and renders whole instances without APIs", async ({ page }) => {
  const apis: string[] = [], errors: string[] = [];
  page.on("request", (request) => { const pathname = new URL(request.url()).pathname; if (pathname.startsWith("/api/") || pathname.startsWith("/__braze/")) apis.push(pathname); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("http://127.0.0.1:4374/player.html?prefabReview"); await expect(panel(page)).toContainText("Active: true");
  const empty = await coloredPixels(page);
  await panel(page).getByRole("button", { name: "Spawn prefab", exact: true }).click(); await expect(panel(page)).toContainText("Instances: 1");
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeGreaterThan(empty.orange + 100);
  await expect.poll(async () => (await coloredPixels(page)).cyan).toBeGreaterThan(empty.cyan + 100);
  await panel(page).getByRole("button", { name: "Remove instance", exact: true }).click(); await expect(panel(page)).toContainText("Instances: 0");
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeLessThan(empty.orange + 30);
  expect((await stats(page)).runtime).toBe(0); expect(apis).toEqual([]); expect(errors).toEqual([]);
});
