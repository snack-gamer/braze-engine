import { expect, test, type APIRequestContext, type Locator, type Page } from "playwright/test";

async function editor(page: Page, request: APIRequestContext) {
  const capabilities = await request.get("/api/automation/v1/capabilities");
  expect(capabilities.ok()).toBe(true);
  expect((await capabilities.json()).operations).toContain("editor.transport");
  await page.goto("/?behaviorReview");
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const invoke = async (operation: string, values = {}) => {
    const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
    const reply = await (await request.post("/api/automation/v1/commands", {
      headers: { "X-Braze-Automation": "1" },
      data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values },
    })).json();
    expect(reply.status).toBe("ok"); return reply.result;
  };
  await expect.poll(async () => (await invoke("editor.status")).loaded).toBe(true);
  return invoke;
}

async function counter(panel: Locator) {
  return Number((await panel.innerText()).match(/Behavior ticks: (\d+)/)?.[1]);
}
const frameGap = (page: Page) => page.evaluate(async () => { for (let index = 0; index < 8; index++) await new Promise(requestAnimationFrame); });

for (const player of [false, true]) test(`entity behaviors follow fixed ticks, pool lifetimes and isolated failures in ${player ? "static player" : "editor"}`, async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [], pageErrors: string[] = [], logs: string[] = [], apis: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { logs.push(message.text()); if (message.type() === "error") errors.push(message.text()); });
  if (player) page.on("request", (value) => { if (/^\/(api|__braze)\//.test(new URL(value.url()).pathname)) apis.push(value.url()); });
  const invoke = player ? null : await editor(page, request);
  const transport = async (action: string) => { if (invoke) await invoke("editor.transport", { action }); };
  const authored = invoke ? (await invoke("editor.inspect")).items : null;
  if (player) await page.goto("http://127.0.0.1:4374/player.html?behaviorReview");
  else { await page.getByRole("tab", { name: "Game", exact: true }).click(); await transport("play"); }
  const panel = page.getByRole("complementary", { name: "Entity behavior review" });
  const guidance = panel.getByRole("status", { name: "Behavior review guidance" });
  const button = (name: string) => panel.getByRole("button", { name, exact: true });
  const click = async (name: string) => { await button(name).click(); if (!player) await transport("step"); };
  await expect(panel).toContainText("Active: true");
  await expect(guidance).toContainText("Next: Click Acquire pair");
  await expect(button("Attach behavior")).toBeDisabled();
  await expect(button("Attach behavior")).toHaveCSS("opacity", "0.45");
  await transport("pause");
  await button("Acquire pair").click();
  if (!player) { await expect(panel).toContainText("Current pair: None"); await transport("step"); }
  await expect(panel).toContainText("Leased: 1 / 2");
  await expect(guidance).toContainText("Next: Click Attach behavior");
  await button("Attach behavior").click();
  if (!player) {
    await expect(panel).toContainText("State: queued"); await frameGap(page);
    expect(await counter(panel)).toBe(0); await transport("step");
  }
  await expect(panel).toContainText("Instance: 1   State: active");
  await expect(panel).toContainText("Started: 1   Enabled: 1   Disabled: 0");
  await expect.poll(() => counter(panel)).toBeGreaterThan(0);
  if (!player) {
    expect(await counter(panel)).toBe(1); await frameGap(page); expect(await counter(panel)).toBe(1);
    await transport("step"); await expect.poll(() => counter(panel)).toBe(2);
    await page.getByRole("tab", { name: "Scene", exact: true }).click();
    await page.getByRole("tab", { name: "Game", exact: true }).click();
    await expect(panel).toContainText("Instance: 1   State: active"); expect(await counter(panel)).toBe(2);
  }
  await click("Disable behavior"); await expect(panel).toContainText("State: disabled");
  const held = await counter(panel); await frameGap(page); expect(await counter(panel)).toBe(held);
  if (!player) { await transport("step"); await frameGap(page); expect(await counter(panel)).toBe(held); }
  await expect(panel).toContainText("Started: 1   Enabled: 1   Disabled: 1");
  await click("Enable behavior"); await expect(panel).toContainText("State: active");
  await expect.poll(() => counter(panel)).toBeGreaterThan(held);
  await expect(panel).toContainText("Started: 1   Enabled: 2   Disabled: 1");
  await click("Detach behavior"); await expect(panel).toContainText("State: disposed");
  await expect(panel).toContainText("Disposed: 1   Cleaned: 1");
  await expect(panel).toContainText("Leased: 1 / 2");
  await expect(panel).toContainText("Attached: 0   Pending: 0");
  expect(logs.filter((line) => line === "[Entity behaviors] Instance 1: start 1.")).toHaveLength(1);
  expect(logs).toContain("[Entity behaviors] Instance 1: cleanup 1; signal aborted: true.");
  await click("Attach behavior"); await expect(panel).toContainText("Instance: 2   State: active");
  await expect(panel).toContainText("Started: 1   Enabled: 1   Disabled: 0");
  if (!player) expect(await counter(panel)).toBe(1);
  await click("Return pair"); await expect(panel).toContainText("Leased: 0 / 2");
  await expect(panel).toContainText("State: disposed");
  await expect(panel).toContainText("Disposed: 1   Cleaned: 1");
  expect(logs).toContain("[Entity behaviors] Instance 2: disposed 1; reason: entity-removed.");
  await click("Acquire pair"); await expect(panel).toContainText("Leased: 1 / 2");
  await click("Attach behavior"); await expect(panel).toContainText("Instance: 3   State: active");
  await expect(panel).toContainText("Started: 1   Enabled: 1   Disabled: 0");
  if (!player) expect(await counter(panel)).toBe(1);
  expect(errors).toEqual([]);
  await click("Fail next tick"); await expect(panel).toContainText("State: failed");
  await expect(panel).toContainText("Disposed: 1   Cleaned: 1");
  await expect(panel).toContainText("Attached: 0   Pending: 0");
  await expect(panel).toContainText("Active: true");
  const mainTicks = await page.evaluate(() => window.gameplayProbe.ticks);
  if (!player) await transport("step");
  await expect.poll(() => page.evaluate(() => window.gameplayProbe.ticks)).toBeGreaterThan(mainTicks);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain("Controlled entity behavior review failure");
  expect(logs).toContain("[Entity behaviors] Instance 3: cleanup 1; signal aborted: true.");
  await click("Attach behavior"); await expect(panel).toContainText("Instance: 4   State: active");
  await expect(panel).toContainText("Disposed: 0   Cleaned: 0");
  if (invoke) {
    await page.screenshot({ path: "/tmp/braze-step8-entity-behaviors.png" });
    await transport("stop"); await expect(panel).toContainText("Active: false");
    await expect(panel).toContainText("Attached: 0   Pending: 0");
    await expect(panel).toContainText("Disposed: 1   Cleaned: 1");
    expect(logs).toContain("[Entity behaviors] Instance 4: disposed 1; reason: world-ended.");
    await expect.poll(async () => (await invoke("editor.inspect")).items).toEqual(authored);
    await expect.poll(async () => (await invoke("editor.status")).dirty).toBe(false);
    await transport("play"); await expect(panel).toContainText("Instance: 0   State: none");
    await expect(panel).toContainText("Leased: 0 / 2");
    await expect(panel).toContainText("Disposed: 0   Cleaned: 0"); await transport("stop");
  }
  expect(pageErrors).toEqual([]); expect(apis).toEqual([]);
});
