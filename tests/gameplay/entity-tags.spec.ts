import { expect, test, type Page, type APIRequestContext } from "playwright/test";
import { PREFAB_REVIEW_FILE } from "./prefab-fixture.mjs";

async function editor(page: Page, request: APIRequestContext) {
  await page.goto("/?tagReview");
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const invoke = async (operation: string, values = {}) => {
    const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
    const reply = await (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" },
      data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values } })).json();
    expect(reply.status).toBe("ok"); return reply.result;
  };
  await expect.poll(async () => (await invoke("editor.status")).loaded).toBe(true); return invoke;
}

for (const player of [false, true]) test(`tags track pooled lifetimes, retagging and query limits in ${player ? "static player" : "editor"}`, async ({ page, request }) => {
  const errors: string[] = [], apis: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  if (player) page.on("request", (value) => { if (/^\/(api|__braze)\//.test(new URL(value.url()).pathname)) apis.push(value.url()); });
  const invoke = player ? null : await editor(page, request);
  const transport = async (action: string) => { if (invoke) await invoke("editor.transport", { action }); };
  const authored = invoke ? (await invoke("editor.inspect")).items : null;
  if (player) await page.goto("http://127.0.0.1:4374/player.html?tagReview");
  else { await page.getByRole("tab", { name: "Game", exact: true }).click(); await transport("play"); }
  const panel = page.getByRole("complementary", { name: "Entity tag review" });
  await expect(panel).toContainText("Active: true");
  const guidance = panel.getByRole("status", { name: "Tag review guidance" });
  const retag = panel.getByRole("button", { name: "Apply root tag", exact: true });
  await expect(guidance).toContainText("Next: Click Acquire pair");
  await expect(retag).toBeDisabled(); await expect(retag).toHaveAttribute("title", "Acquire a pair first.");
  await expect(retag).toHaveCSS("opacity", "0.45");
  const query = async (tag: string, count: number, total = count) => {
    await panel.getByRole("textbox", { name: "Query tag", exact: true }).fill(tag);
    await panel.getByRole("button", { name: "Query tag", exact: true }).click();
    await expect(panel).toContainText(`Matches: ${count} / ${total}; truncated: ${count < total}`);
  };
  const acquire = panel.getByRole("button", { name: "Acquire pair", exact: true });
  await query("Temporary", 0); await expect(guidance).toContainText("Next: Click Acquire pair");
  await query("Reusable", 0); if (!player) await transport("pause");
  await acquire.click(); if (!player) { await query("Reusable", 0); await transport("step"); }
  await expect(panel).toContainText("Leased: 1 / 2"); await query("Reusable", 1);
  await expect(guidance).toContainText("Next: Click Apply root tag to assign Temporary");
  await expect(panel).toContainText("Current pair tag: Reusable"); await expect(retag).toBeEnabled();
  await retag.click();
  if (!player) { await query("Reusable", 1); await transport("step"); }
  await expect(panel).toContainText("Retag committed"); await query("Reusable", 0); await query("Temporary", 1);
  await expect(guidance).toContainText("Tag applied. Set Query tag to Temporary");
  await expect(panel).toContainText("Current pair tag: Temporary");
  await panel.getByRole("button", { name: "Return pair", exact: true }).click(); if (!player) await transport("step");
  await expect(panel).toContainText("Leased: 0 / 2"); await query("Temporary", 0);
  await expect(retag).toBeDisabled(); await expect(guidance).toContainText("Next: Click Acquire pair");
  await acquire.click(); if (!player) await transport("step"); await expect(panel).toContainText("Leased: 1 / 2");
  await query("Temporary", 0); await query("Reusable", 1);
  await acquire.click(); if (!player) await transport("step"); await expect(panel).toContainText("Leased: 2 / 2");
  await panel.getByRole("textbox", { name: "Result limit", exact: true }).fill("1"); await query("Reusable", 1, 2);
  if (invoke) {
    await transport("stop"); await expect(panel).toContainText("Indexed tags: 0");
    await expect(guidance).toContainText("Next: Press ▶ Play");
    await expect.poll(async () => (await invoke("editor.inspect")).items).toEqual(authored);
    await expect.poll(async () => (await invoke("editor.status")).dirty).toBe(false);
    await transport("play"); await expect(panel).toContainText("Leased: 0 / 2"); await query("Reusable", 0); await transport("stop");
  }
  expect(errors).toEqual([]); expect(apis).toEqual([]);
});

test("Inspector tags support scene save/reload and undo, plus saved prefab authoring", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const invoke = await editor(page, request);
  const transport = (action: string) => invoke("editor.transport", { action });
  await invoke("editor.select", { objectId: "hero" });
  const tags = page.getByRole("combobox", { name: "Object tag", exact: true });
  await page.getByRole("button", { name: "Manage tags…", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "Project Tags", exact: true });
  const newName = manager.getByRole("textbox", { name: "New tag name", exact: true });
  await newName.fill("bad tag"); await manager.getByRole("button", { name: "Add tag", exact: true }).click();
  await expect(manager.getByRole("alert")).toContainText("Tags require");
  for (const name of ["Actor", "Collectible", "Unused"]) {
    await newName.fill(name); await manager.getByRole("button", { name: "Add tag", exact: true }).click();
    await expect(manager.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await manager.getByRole("button", { name: "Unused", exact: true }).click();
  await manager.getByRole("button", { name: "Remove unused tag", exact: true }).click();
  await expect(manager.getByRole("button", { name: "Unused", exact: true })).toHaveCount(0);
  await manager.getByRole("button", { name: "Reusable", exact: true }).click();
  await expect(manager.getByRole("region", { name: "Tag assignments", exact: true })).toContainText("Runtime Duo");
  await expect(manager.getByRole("button", { name: "Remove unused tag", exact: true })).toBeDisabled();
  await page.screenshot({ path: "/tmp/braze-step7-tag-manager.png" });
  await manager.getByRole("button", { name: "Close tags", exact: true }).click();
  await tags.selectOption("Actor");
  await invoke("editor.undo"); await expect(tags).toHaveValue("");
  await invoke("editor.redo"); await expect(tags).toHaveValue("Actor");
  await page.getByRole("button", { name: "Manage tags…", exact: true }).click();
  await manager.getByRole("button", { name: "Actor", exact: true }).click();
  await expect(manager.getByRole("region", { name: "Tag assignments", exact: true })).toContainText("Open document: 1 assignment");
  await expect(manager.getByRole("region", { name: "Tag assignments", exact: true })).toContainText("Hero");
  await manager.getByRole("button", { name: "Close tags", exact: true }).click();
  await invoke("editor.select", { objectId: "floor" }); await invoke("editor.select", { objectId: "hero" });
  await expect(tags).toHaveValue("Actor");
  await invoke("editor.save"); await page.reload();
  await expect.poll(async () => (await invoke("editor.status")).loaded).toBe(true);
  await invoke("editor.select", { objectId: "hero" }); await expect(tags).toHaveValue("Actor");
  await page.getByRole("tab", { name: "Game", exact: true }).click(); await transport("play");
  const panel = page.getByRole("complementary", { name: "Entity tag review" });
  await expect(panel).toContainText("Active: true");
  await panel.getByRole("textbox", { name: "Query tag", exact: true }).fill("Actor");
  await panel.getByRole("button", { name: "Query tag", exact: true }).click(); await expect(panel).toContainText("Matches: 1 / 1");
  await transport("stop"); await expect(tags).toHaveValue("Actor");
  const endpoint = `/api/assets/prefab?filename=${encodeURIComponent(PREFAB_REVIEW_FILE)}`;
  const original = await (await request.get(endpoint)).json();
  try {
    await page.getByRole("tab", { name: "Scene", exact: true }).click();
    await page.getByRole("button", { name: "All Prefabs", exact: true }).click();
    await page.locator(".prefab-tile").filter({ hasText: "Runtime Duo" }).click();
    await page.getByRole("button", { name: "Edit prefab", exact: true }).click();
    const mode = page.getByRole("status", { name: "Prefab edit mode" }); await expect(mode).toBeVisible();
    await page.locator(".object-row").filter({ hasText: "Runtime Duo" }).first().click();
    await expect(tags).toHaveValue("Reusable"); await tags.selectOption("Collectible");
    expect((await (await request.get(endpoint)).json()).revision).toBe(original.revision);
    await mode.getByRole("button", { name: "Save", exact: true }).click();
    await expect(mode.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
    expect((await (await request.get(endpoint)).json()).prefab.objects[0].tags).toEqual(["Collectible"]);
    await mode.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("tab", { name: "Game", exact: true }).click(); await transport("play");
    await expect(panel).toContainText("Active: true"); await panel.getByRole("button", { name: "Acquire pair", exact: true }).click();
    await expect(panel).toContainText("Leased: 1 / 2");
    await panel.getByRole("textbox", { name: "Query tag", exact: true }).fill("Collectible");
    await panel.getByRole("button", { name: "Query tag", exact: true }).click(); await expect(panel).toContainText("Matches: 1 / 1");
    await page.screenshot({ path: "/tmp/braze-step7-tags.png" }); await transport("stop");
  } finally {
    const current = await (await request.get(endpoint)).json();
    await request.put(endpoint, { data: { prefab: original.prefab, name: original.prefab.name, baseRevision: current.revision } });
  }
});
