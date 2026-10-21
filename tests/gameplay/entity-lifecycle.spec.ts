import { expect, test, type Page } from "playwright/test";

const panel = (page: Page) => page.getByRole("complementary", { name: "Entity lifecycle review" });
const stats = (page: Page) => page.evaluate(() => window.gameplayProbe.context.world.stats());
const frameGap = (page: Page) => page.evaluate(async () => { for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame); });

test("entity review commits on Step, rejects stale references, stays atomic and resets on Stop", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const invoke = async (operation: string, values = {}) => (await request.post("/api/automation/v1/commands", {
    headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values },
  })).json();
  await expect.poll(async () => (await invoke("editor.status")).result?.loaded).toBe(true);
  const authored = (await invoke("editor.inspect")).result.items;
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await invoke("editor.transport", { action: "play" });
  await expect(panel(page)).toContainText("Active: true");
  await invoke("editor.transport", { action: "pause" });
  await panel(page).getByRole("button", { name: "Create entity", exact: true }).click();
  await frameGap(page);
  expect(await stats(page)).toMatchObject({ runtime: 0, queuedCommands: 1 });
  await expect(panel(page)).toContainText("Queued — waiting");
  await invoke("editor.transport", { action: "step" });
  await expect.poll(async () => (await stats(page)).runtime).toBe(1);
  await expect(panel(page)).toContainText("generation 1");
  const firstHandle = (await panel(page).innerText()).match(/Handle: (\d+) \/ generation (\d+)/)!;
  await panel(page).getByRole("button", { name: "Remove entity", exact: true }).click();
  await frameGap(page); expect((await stats(page)).runtime).toBe(1);
  await invoke("editor.transport", { action: "step" });
  await expect.poll(async () => (await stats(page)).runtime).toBe(0);
  await panel(page).getByRole("button", { name: "Check old handle", exact: true }).click();
  await expect(panel(page)).toContainText("Old handle rejected: stale-handle");
  await panel(page).getByRole("button", { name: "Create entity", exact: true }).click();
  await invoke("editor.transport", { action: "step" });
  await expect(panel(page)).toContainText(`Handle: ${firstHandle[1]} / generation 2`);
  await panel(page).getByRole("button", { name: "Test atomic rejection", exact: true }).click();
  await invoke("editor.transport", { action: "step" });
  await expect(panel(page)).toContainText("Batch rejected: unsupported-component. No partial change.");
  expect((await stats(page)).runtime).toBe(1);
  await page.getByRole("tab", { name: "Scene", exact: true }).click();
  expect((await stats(page)).runtime).toBe(1);
  await invoke("editor.transport", { action: "stop" });
  await expect.poll(async () => (await stats(page)).ended).toBe(true);
  expect((await invoke("editor.inspect")).result.items).toEqual(authored);
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await invoke("editor.transport", { action: "play" });
  await expect(panel(page)).toContainText("Active: true");
  expect((await stats(page)).runtime).toBe(0);
  await panel(page).getByRole("button", { name: "Check old handle", exact: true }).click();
  await expect(panel(page)).toContainText("Old handle rejected: stale-handle");
  await invoke("editor.transport", { action: "stop" }); expect(errors).toEqual([]);
});

test("the static player uses the same entity lifecycle without editor services", async ({ page }) => {
  const apis: string[] = [], errors: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apis.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4374/player.html");
  await expect(panel(page)).toContainText("Active: true");
  await panel(page).getByRole("button", { name: "Create entity", exact: true }).click();
  await expect.poll(async () => (await stats(page)).runtime).toBe(1);
  await panel(page).getByRole("button", { name: "Remove entity", exact: true }).click();
  await expect.poll(async () => (await stats(page)).runtime).toBe(0);
  await panel(page).getByRole("button", { name: "Check old handle", exact: true }).click();
  await expect(panel(page)).toContainText("Old handle rejected: stale-handle");
  await panel(page).getByRole("button", { name: "Test atomic rejection", exact: true }).click();
  await expect(panel(page)).toContainText("No partial change");
  expect((await stats(page)).runtime).toBe(0); expect(apis).toEqual([]); expect(errors).toEqual([]);
});
