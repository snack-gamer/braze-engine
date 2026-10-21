import { expect, test, type Page, type APIRequestContext } from "playwright/test";
import { coloredPixels } from "../gameplay/colored-pixels";
declare const process: { env: Record<string, string | undefined> };
const physics = !process.env.BRAZE_DESTRUCTION_WITHOUT_PHYSICS;

async function editor(page: Page, request: APIRequestContext) {
  await page.goto("/");
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const invoke = async (operation: string, values = {}) => {
    const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
    const reply = await (await request.post("/api/automation/v1/commands", {
      headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), sessionId, operation, ...values },
    })).json();
    expect(reply.status, JSON.stringify(reply)).toBe("ok"); return reply.result;
  };
  await expect.poll(async () => (await invoke("editor.status")).loaded).toBe(true);
  return invoke;
}
const frameGap = (page: Page) => page.evaluate(async () => { for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame); });

for (const player of [false, true]) test(`authored subtree destruction cleans every owner and preserves the ${player ? "exported player" : "editor"} world`, async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [], apis: string[] = [], logs: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { logs.push(message.text()); if (message.type() === "error") errors.push(message.text()); });
  if (player) page.on("request", (req) => { if (/^\/(api|__braze)\//.test(new URL(req.url()).pathname)) apis.push(req.url()); });
  const invoke = player ? null : await editor(page, request);
  const transport = async (action: string) => { if (invoke) await invoke("editor.transport", { action }); };
  const authored = invoke ? (await invoke("editor.inspect")).items : null;
  if (player) await page.goto("http://127.0.0.1:4374/player.html");
  else { await page.getByRole("tab", { name: "Game", exact: true }).click(); await transport("play"); }
  const panel = page.getByRole("complementary", { name: "Authored destruction review" });
  const click = (name: string) => panel.getByRole("button", { name, exact: true }).click();
  await expect(panel).toContainText("Active: true"); await expect(panel).toContainText("Started: 5");
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeGreaterThan(100);
  await expect.poll(async () => (await coloredPixels(page)).cyan).toBeGreaterThan(100);
  await transport("pause");
  const tick = await page.evaluate(() => window.destructionProbe.ticks);
  const count = await page.evaluate(() => window.destructionProbe.context!.world.stats().alive);
  const bodies = invoke ? (await invoke("editor.status")).physics.bodyCount : null;
  await click("Destroy group");
  if (!player) {
    await frameGap(page); expect(await page.evaluate(() => window.destructionProbe.context!.world.stats().alive)).toBe(count);
    expect(await page.evaluate(() => window.destructionProbe.ticks)).toBe(tick); await transport("step");
  }
  await expect(panel).toContainText("3 objects removed"); await expect(panel).toContainText("Disposed: 3   Cleaned: 3");
  await expect.poll(() => page.evaluate(() => window.destructionProbe.context!.world.queryTag("Reusable", 16).total)).toBe(0);
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeLessThan(30);
  await expect.poll(async () => (await coloredPixels(page)).cyan).toBeLessThan(30);
  if (invoke) {
    if (physics) {
      expect((await invoke("editor.status")).physics.submittedStepId).toBe(tick + 1);
      expect((await invoke("editor.status")).physics.bodyCount).toBe(bodies - 2);
    }
    await page.getByRole("tab", { name: "Scene", exact: true }).click();
    await page.getByRole("tab", { name: "Game", exact: true }).click();
    await expect.poll(async () => (await coloredPixels(page)).orange).toBeLessThan(30);
    expect(await page.evaluate(() => window.destructionProbe.context!.world.stats().alive)).toBe(count - 3);
  }
  await click("Check old handles"); await expect(panel).toContainText("PASS — old handles are stale");
  const behaviorTicks = await page.evaluate(() => window.destructionProbe.behaviorTicks);
  await transport("play");
  await expect.poll(() => page.evaluate(() => window.destructionProbe.behaviorTicks)).toBeGreaterThan(behaviorTicks);
  if (physics) {
    await click("Walk right");
    await expect.poll(() => page.evaluate(() => window.destructionProbe.position[0])).toBeGreaterThan(2.4);
    await frameGap(page); expect(await page.evaluate(() => window.destructionProbe.position[0])).toBeLessThan(2.6);
  }
  await click("Destroy wall");
  await expect(panel).toContainText("Disposed: 4   Cleaned: 4");
  if (physics) {
    await expect.poll(() => page.evaluate(() => window.destructionProbe.position[0])).toBeGreaterThan(3.5);
    await click("Walk right");
  }
  await click("Destroy hero");
  await expect(panel).toContainText("Disposed: 5   Cleaned: 5");
  await expect.poll(() => page.evaluate(() => window.destructionProbe.context!.behaviors.stats().attached)).toBe(0);
  const after = await page.evaluate(() => window.destructionProbe.ticks);
  await expect.poll(() => page.evaluate(() => window.destructionProbe.ticks)).toBeGreaterThan(after);
  await click("Check old handles"); await expect(panel).toContainText("PASS — old handles are stale");
  expect(logs.filter((line) => line.includes("Behavior disposed: entity-removed"))).toHaveLength(5);
  if (invoke) {
    await page.screenshot({ path: "/tmp/braze-step9-destruction.png" });
    await transport("stop"); await expect(panel).toContainText("Active: false");
    await expect.poll(async () => (await invoke("editor.inspect")).items).toEqual(authored);
    await expect.poll(async () => (await invoke("editor.status")).dirty).toBe(false);
    await transport("play"); await expect(panel).toContainText("Started: 5   Disposed: 0   Cleaned: 0");
    await expect.poll(async () => (await coloredPixels(page)).orange).toBeGreaterThan(100);
    expect(await page.evaluate(() => window.destructionProbe.context!.world.stats().alive)).toBe(count);
    await transport("stop");
  }
  expect(errors).toEqual([]); expect(apis).toEqual([]);
});
