import { expect, test, type Page, type APIRequestContext } from "playwright/test";
import { DEFAULT_DOCK_DOCUMENT, dockPane } from "../../src/docking/layout";
import { DOCK_STORAGE_KEY } from "../../src/docking/dock-persistence";
import { coloredPixels } from "../gameplay/colored-pixels";
import type {} from "../gameplay/fixtures/model-game";
const sourcePattern = /\/3d-models\/Runtime%20Crate\.(gltf|glb)\?/;
const panel = (page: Page) => page.getByRole("complementary", { name: "Runtime models review" });
async function openEditor(page: Page, request: APIRequestContext) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(({ key, layout }) => localStorage.setItem(key, JSON.stringify(layout)), { key: DOCK_STORAGE_KEY, layout: dockPane(DEFAULT_DOCK_DOCUMENT, "game", "inspector", "center") });
  await page.goto("/");
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const invoke = async (operation: string, values = {}) => {
    const reply = await (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), sessionId, operation, ...values } })).json();
    expect(reply.status, JSON.stringify(reply)).toBe("ok"); return reply.result;
  };
  await expect.poll(async () => (await invoke("editor.status")).loaded).toBe(true);
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  return invoke;
}
for (const player of [false, true]) test(`${player ? "player" : "editor"}: textured model spawn, independent materials, pooling and lifetime`, async ({ page, request }) => {
  const errors: string[] = [], apis: string[] = [], models: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", (req) => { if (sourcePattern.test(req.url()) && !req.url().includes("previewRevision=")) models.push(req.url()); if (player && /^\/(api|__braze)\//.test(new URL(req.url()).pathname)) apis.push(req.url()); });
  let invoke: Awaited<ReturnType<typeof openEditor>> | undefined;
  let saved: string | undefined;
  if (player) { await page.setViewportSize({ width: 1600, height: 1000 }); await page.goto("http://127.0.0.1:4374/player.html"); }
  else { invoke = await openEditor(page, request); await invoke("editor.save"); saved = await (await request.get("/api/scenes/current")).text(); await invoke("editor.transport", { action: "play" }); }
  await expect(panel(page)).toContainText("Active: true");
  const empty = await coloredPixels(page);
  await panel(page).getByRole("button", { name: "Spawn pair", exact: true }).click();
  await expect(panel(page)).toContainText("Instances: 1");
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeGreaterThan(empty.orange + 100);
  await expect.poll(async () => (await coloredPixels(page)).cyan).toBeGreaterThan(empty.cyan + 100);
  expect(await page.evaluate(() => window.modelProbe.context!.world.stats().runtime)).toBe(3);
  await panel(page).getByRole("button", { name: "Acquire pair", exact: true }).click(); await expect(panel(page)).toContainText("Instances: 2");
  await panel(page).getByRole("button", { name: "Remove last", exact: true }).click(); await expect(panel(page)).toContainText("Instances: 1");
  await expect.poll(() => page.evaluate(() => window.modelProbe.pool!.stats().available)).toBe(2);
  await panel(page).getByRole("button", { name: "Test old handle", exact: true }).click(); await expect(panel(page)).toContainText("PASS: old instance is stale");
  await panel(page).getByRole("button", { name: "Acquire pair", exact: true }).click(); await expect(panel(page)).toContainText("Instances: 2"); await expect(panel(page)).toContainText("Pool reuses: 1");
  expect(models).toHaveLength(1);
  if (invoke) {
    await invoke("editor.transport", { action: "pause" });
    const tick = await page.evaluate(() => window.modelProbe.ticks);
    await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick(); await expect(page.locator(".three-host")).toHaveCount(0);
    expect(await page.evaluate(() => window.modelProbe.context!.world.stats().runtime)).toBe(6);
    await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick(); await expect(page.locator(".three-host")).toHaveCount(2);
    await expect.poll(async () => (await coloredPixels(page)).cyan).toBeGreaterThan(empty.cyan + 100);
    expect(await page.evaluate(() => window.modelProbe.ticks)).toBe(tick);
    await invoke("editor.transport", { action: "play" });
  }
  await page.screenshot({ path: `/tmp/braze-step11-${player ? "player" : "editor"}.png` });
  for (const count of [1, 0]) { await panel(page).getByRole("button", { name: "Remove last", exact: true }).click(); await expect(panel(page)).toContainText(`Instances: ${count}`); }
  await expect.poll(() => page.evaluate(() => window.modelProbe.context!.world.stats().runtime)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.modelProbe.pool!.stats().available)).toBe(2);
  await panel(page).getByRole("button", { name: "Dispose pool", exact: true }).click(); await expect(panel(page)).toContainText("Pool disposed");
  if (invoke) {
    await invoke("editor.transport", { action: "stop" }); await expect(panel(page)).toContainText("Active: false");
    await expect.poll(async () => (await invoke!("editor.status")).dirty).toBe(false);
    expect(await (await request.get("/api/scenes/current")).text()).toBe(saved);
  }
  expect(errors).toEqual([]); expect(apis).toEqual([]);
});

test("missing imported textures reject the whole spawn; Stop cancels a delayed source", async ({ page, request }) => {
  const invoke = await openEditor(page, request);
  await page.route("**/crate.png", (route) => route.fulfill({ status: 404, body: "missing fixture texture" }));
  await invoke("editor.transport", { action: "play" }); await expect(panel(page)).toContainText("Active: true");
  await panel(page).getByRole("button", { name: "Spawn pair", exact: true }).click();
  await expect(panel(page)).toContainText("Spawn rejected");
  expect(await page.evaluate(() => window.modelProbe.context!.world.stats().runtime)).toBe(0);
  await invoke("editor.transport", { action: "stop" }); await page.unroute("**/crate.png");
  await page.route("**/override.png?*", (route) => route.fulfill({ status: 404, body: "missing saved material texture" }));
  await invoke("editor.transport", { action: "play" }); await expect(panel(page)).toContainText("Active: true");
  await panel(page).getByRole("button", { name: "Spawn pair", exact: true }).click();
  await expect(panel(page)).toContainText("Spawn rejected");
  expect(await page.evaluate(() => window.modelProbe.context!.world.stats().runtime)).toBe(0);
  await invoke("editor.transport", { action: "stop" }); await page.unroute("**/override.png?*");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; }); let loading = false;
  await page.route(sourcePattern, async (route) => { loading = true; await gate; await route.continue(); });
  await invoke("editor.transport", { action: "play" }); await expect(panel(page)).toContainText("Active: true");
  await panel(page).getByRole("button", { name: "Spawn pair", exact: true }).click(); await expect.poll(() => loading).toBe(true);
  await expect(panel(page)).toContainText("Pending: preparing");
  await invoke("editor.transport", { action: "stop" }); release(); await expect(panel(page)).toContainText("Active: false");
  await page.unroute(sourcePattern);
  await invoke("editor.transport", { action: "play" }); await expect(panel(page)).toContainText("Active: true");
  expect(await page.evaluate(() => window.modelProbe.context!.world.stats().runtime)).toBe(0);
  await panel(page).getByRole("button", { name: "Spawn pair", exact: true }).click(); await expect(panel(page)).toContainText("Instances: 1");
  await invoke("editor.transport", { action: "stop" });
});


test("saved Prefab editor changes reach model instances on the next Play", async ({ page, request }) => {
  const invoke = await openEditor(page, request), endpoint = "/api/assets/prefab?filename=Model%20Pair.braze-prefab.json";
  const original = await (await request.get(endpoint)).json();
  try {
    await page.getByRole("button", { name: "All Prefabs", exact: true }).click();
    await page.locator(".prefab-tile").filter({ hasText: "Model Pair" }).click();
    await page.getByRole("tab", { name: "Inspector", exact: true }).click();
    await page.getByRole("button", { name: "Edit prefab", exact: true }).click();
    const mode = page.getByRole("status", { name: "Prefab edit mode" }); await expect(mode).toBeVisible();
    await page.locator(".object-row").getByText("Imported orange", { exact: true }).click();
    const scale = page.getByRole("spinbutton", { name: "Scale X", exact: true }); await scale.fill("1.5"); await scale.press("Enter");
    expect((await (await request.get(endpoint)).json()).revision).toBe(original.revision);
    await mode.getByRole("button", { name: "Save", exact: true }).click(); await expect(mode.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
    await mode.getByRole("button", { name: "Close", exact: true }).click();
    await invoke("editor.transport", { action: "play" }); await expect(panel(page)).toContainText("Active: true");
    await panel(page).getByRole("button", { name: "Spawn pair", exact: true }).click(); await expect(panel(page)).toContainText("Instances: 1");
    const width = await page.evaluate(() => {
      const probe = window.modelProbe, handle = probe.instances[0].instance.entities["Imported orange"];
      return probe.context!.world.inspect(handle).model!.worldTransform.scale[0];
    });
    expect(width).toBe(1.5); await invoke("editor.transport", { action: "stop" });
  } finally {
    const current = await (await request.get(endpoint)).json();
    await request.put(endpoint, { data: { prefab: original.prefab, name: original.prefab.name, baseRevision: current.revision } });
  }
});
