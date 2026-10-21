import { expect, test } from "playwright/test";

test("pool actions produce readable one-time results in the engine Console", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const logs: string[] = [], errors: string[] = [];
  page.on("console", (message) => { if (message.text().startsWith("[Prefab pools]")) logs.push(message.text()); if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?poolReview");
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const invoke = async (operation: string, values = {}) => {
    const result = await (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" },
      data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values } })).json();
    expect(result.status).toBe("ok"); return result.result;
  };
  const transport = (action: string) => invoke("editor.transport", { action });
  await expect.poll(async () => (await invoke("editor.status")).loaded).toBe(true);
  await page.getByRole("tab", { name: "Game", exact: true }).click(); await transport("play");
  const panel = page.getByRole("complementary", { name: "Prefab pool review" });
  await expect(panel).toContainText("Active: true");
  await page.getByRole("button", { name: "Open Console", exact: true }).click();
  const output = page.getByLabel("Editor Console", { exact: true });
  await output.getByRole("searchbox", { name: "Search Console", exact: true }).fill("Prefab pools");
  const rows = (text: string) => output.getByRole("option").filter({ hasText: text });
  await expect(rows("Pool created:")).toHaveCount(1);
  // Expected stale-handle rejection must be an informational PASS, even with Error Pause enabled.
  await output.getByRole("button", { name: "Error Pause", exact: true }).click();
  await transport("pause");
  await panel.getByRole("button", { name: "Acquire pair", exact: true }).click();
  await expect(rows("Acquire queued")).toHaveCount(1); await expect(rows("Acquire committed")).toHaveCount(0);
  await transport("step"); await expect(rows("Acquire committed")).toHaveCount(1);
  await panel.getByRole("button", { name: "Return pair", exact: true }).click();
  await expect(rows("Return queued")).toHaveCount(1); await expect(rows("Return committed")).toHaveCount(0);
  await transport("step"); await expect(rows("Return committed")).toHaveCount(1); await expect(rows("Return ready:")).toHaveCount(1);
  await transport("play");
  await panel.getByRole("button", { name: "Test old lease", exact: true }).click();
  const passed = rows("PASS — Old lease rejected: stale-handle"); await expect(passed).toHaveCount(1); await expect(passed).toHaveClass(/is-log/);
  expect((await invoke("editor.status")).mode).toBe("playing");
  await panel.getByRole("button", { name: "Dispose pool", exact: true }).click();
  const disposed = rows("Pool disposed:"); await expect(disposed).toHaveCount(1); await disposed.click();
  const details = output.getByLabel("Selected Console message", { exact: true });
  await expect(details).toContainText("retained slots released"); await expect(details).toContainText("dormant nodes: 0");
  await panel.getByRole("button", { name: "Create pool", exact: true }).click(); await expect(rows("Pool created:")).toHaveCount(2);
  // Observe several 100 ms panel refreshes: a settled action must not flood the Console.
  const settledLogs = logs.length; await page.waitForTimeout(450); expect(logs).toHaveLength(settledLogs);
  await transport("stop"); await expect(rows("Play stopped:")).toHaveCount(1);
  await expect(panel).toContainText("Active: false"); expect(errors).toEqual([]);
});
