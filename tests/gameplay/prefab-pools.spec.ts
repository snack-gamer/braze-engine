import { expect, test } from "playwright/test";
import { coloredPixels } from "./colored-pixels";

for (const player of [false, true]) test(`prefab pool capacity, reset, stale leases and disposal in ${player ? "static player" : "editor"}`, async ({ page, request }) => {
  const errors: string[] = [], apis: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  if (player) page.on("request", (value) => { if (/^\/(api|__braze)\//.test(new URL(value.url()).pathname)) apis.push(value.url()); });
  await page.goto(player ? "http://127.0.0.1:4374/player.html?poolReview" : "/?poolReview");
  const invoke = async (operation: string, values: Record<string, unknown> = {}) => {
    const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
    const result = await (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values } })).json();
    expect(result.status).toBe("ok"); return result.result;
  };
  const transport = (action: string) => invoke("editor.transport", { action });
  let authored: unknown;
  if (!player) {
    await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
    await expect.poll(async () => (await invoke("editor.status")).loaded).toBe(true);
    authored = (await invoke("editor.inspect")).items;
  }
  if (!player) { await page.getByRole("tab", { name: "Game", exact: true }).click(); await transport("play"); }
  const panel = page.getByRole("complementary", { name: "Prefab pool review" });
  const acquire = panel.getByRole("button", { name: "Acquire pair", exact: true }), release = panel.getByRole("button", { name: "Return pair", exact: true });
  await expect(panel).toContainText("Active: true"); const empty = await coloredPixels(page);
  if (!player) await transport("pause");
  await acquire.click();
  if (!player) { await expect(panel).toContainText("Runtime nodes: 0"); await transport("step"); }
  await expect(panel).toContainText("Leased: 1 / 2"); await expect.poll(async () => (await coloredPixels(page)).orange).toBeGreaterThan(empty.orange + 100);
  const first = (await panel.innerText()).match(/Latest root: #(\d+):(\d+)/)!;
  await release.click(); if (!player) await transport("step");
  await expect(panel).toContainText("Available: 2"); await expect(panel).toContainText("Dormant nodes: 4");
  await expect.poll(async () => (await coloredPixels(page)).orange).toBeLessThan(empty.orange + 30);
  await acquire.click(); if (!player) await transport("step");
  await expect(panel).toContainText("Reuses: 1"); const second = (await panel.innerText()).match(/Latest root: #(\d+):(\d+)/)!;
  expect(second[1]).toBe(first[1]); expect(Number(second[2])).toBeGreaterThan(Number(first[2]));
  await panel.getByRole("button", { name: "Test old lease", exact: true }).click(); await expect(panel).toContainText("Old lease rejected: stale-handle");
  await acquire.click(); if (!player) await transport("step"); await expect(panel).toContainText("Leased: 2 / 2");
  await acquire.click(); await expect(panel).toContainText("Rejected: capacity"); await expect(panel).toContainText("Runtime nodes: 8");
  if (!player) { await page.getByRole("tab", { name: "Scene", exact: true }).click(); await page.getByRole("tab", { name: "Game", exact: true }).click(); }
  for (let i = 0; i < 2; i++) { await release.click(); if (!player) await transport("step"); await expect(acquire).toBeEnabled(); }
  await expect(panel).toContainText("Available: 2"); await expect(panel).toContainText("Dormant nodes: 8");
  await panel.getByRole("button", { name: "Dispose pool", exact: true }).click(); await expect(panel).toContainText("Dormant nodes: 0");
  await panel.getByRole("button", { name: "Create pool", exact: true }).click(); await expect(panel).toContainText("Retained pairs: 0");
  // Exceed the startup reserve cumulatively: disposing pools must return GPU slots
  // through the gameplay host adapter, not just clear logical diagnostics.
  for (let cycle = 0; cycle < 12; cycle++) {
    await acquire.click(); if (!player) await transport("step"); await expect(panel).toContainText("Leased: 1 / 2");
    await release.click(); if (!player) await transport("step"); await expect(panel).toContainText("Available: 2");
    await panel.getByRole("button", { name: "Dispose pool", exact: true }).click(); await expect(panel).toContainText("Dormant nodes: 0");
    await panel.getByRole("button", { name: "Create pool", exact: true }).click();
  }
  await acquire.click(); if (!player) { await transport("step"); await expect(panel).toContainText("Leased: 1 / 2"); await transport("stop"); await transport("play"); }
  else await page.reload();
  await expect(panel).toContainText("Active: true"); await expect(panel).toContainText("Runtime nodes: 0"); await expect(panel).toContainText("Retained pairs: 0");
  if (!player) {
    await transport("stop");
    await expect.poll(async () => (await invoke("editor.inspect")).items).toEqual(authored);
    await expect.poll(async () => (await invoke("editor.status")).dirty).toBe(false);
  }
  expect(errors).toEqual([]); expect(apis).toEqual([]);
});
