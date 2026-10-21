import { expect, test } from "playwright/test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { fileURLToPath } from "node:url";
import { createStockControlInputMap } from "../../src/input/domain/stock-control-input-map";
import { stockControlPixels } from "../stock-controls/stock-controls-pixels";

type MapReceipt = { asset: { guid: string; filename: string }; revision: string; document: ReturnType<typeof controls>; applied: boolean };
const controls = (name: string, code: string) => ({ version: "braze/input-action-map-v1", name, map: {
  version: 1, actions: [...createStockControlInputMap().actions, { name: "collect", kind: "button", bindings: [{ device: "keyboard", code }] }],
} });

test("MCP input assets share manual drafts, revisions and playable next-run selection", async ({ page }, info) => {
  const client = new Client({ name: "input-authoring-regression", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL("../../scripts/engine-mcp.mjs", import.meta.url))], env: { BRAZE_ENGINE_URL: "http://127.0.0.1:4373" } }));
  const call = (operation: string, args = {}) => client.callTool({ name: `braze_${operation.replaceAll(".", "_")}`, arguments: args });
  const ok = async <T,>(operation: string, args = {}) => {
    const reply = await call(operation, args); expect(reply.isError, JSON.stringify(reply)).not.toBe(true);
    return reply.structuredContent!.result as T;
  };
  const binding = (receipt: MapReceipt) => receipt.document.map.actions.find((action) => action.name === "collect")!;
  let sessionId = "";
  const reopen = async () => {
    await page.reload();
    await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
    sessionId = (await page.locator("html").getAttribute("data-braze-editor-session"))!;
    await expect.poll(async () => (await ok<{ loaded: boolean }>("editor.status", { sessionId })).loaded).toBe(true);
  };
  try {
    const tools = (await client.listTools()).tools;
    expect(tools.map((entry) => entry.name)).toEqual(expect.arrayContaining(["braze_input_map_create", "braze_input_map_inspect", "braze_input_map_save", "braze_input_project_inspect", "braze_input_project_select"]));
    const draft = controls("Agent Controls", "KeyJ");
    const preview = await ok<MapReceipt>("input.map.create", { document: draft });
    expect(preview.applied).toBe(false); expect(preview.asset).toBeNull();
    const created = await ok<MapReceipt>("input.map.create", { document: draft, apply: true });
    const alternate = await ok<MapReceipt>("input.map.create", { document: controls("Alternate Controls", "KeyK"), apply: true });
    const initial = await ok<{ revision: string | null }>("input.project.inspect");
    const selected = await ok<{ revision: string }>("input.project.select", { assetGuid: created.asset.guid, baseRevision: initial.revision, apply: true });
    const stale = await call("input.project.select", { assetGuid: alternate.asset.guid, baseRevision: initial.revision, apply: true });
    expect(stale.isError).toBe(true); expect(stale.structuredContent).toMatchObject({ status: "conflict", section: "input", actualRevision: selected.revision });
    await page.setViewportSize({ width: 1600, height: 1000 }); await page.goto("/"); await reopen();
    await page.locator(".input-asset-tile").filter({ hasText: "Agent-Controls" }).dblclick();
    const inspector = page.locator(".rail-scroll.input-map");
    await expect(inspector.getByLabel("Project input map", { exact: true })).toHaveValue(created.asset.guid);
    const actionIndex = draft.map.actions.length;
    const code = inspector.getByLabel(`Action ${actionIndex} binding 1 keyboard code`, { exact: true });
    await expect(code).toHaveValue("KeyJ"); await code.fill("KeyL");
    const remote = await ok<MapReceipt>("input.map.save", { assetGuid: created.asset.guid, baseRevision: created.revision, document: controls("Agent Controls", "KeyM"), apply: true });
    const conflict = page.waitForResponse((reply) => reply.url().includes("/api/assets/input-action-map") && reply.request().method() === "PUT");
    await inspector.getByRole("button", { name: "Save input map", exact: true }).click(); expect((await conflict).status()).toBe(409);
    await expect(code).toHaveValue("KeyL"); await expect(inspector.getByRole("alert")).toContainText("changed on disk");
    await inspector.getByRole("button", { name: "Revert input map", exact: true }).click(); await expect(code).toHaveValue("KeyM");
    await code.fill("KeyJ");
    const saved = page.waitForResponse((reply) => reply.url().includes("/api/assets/input-action-map") && reply.request().method() === "PUT");
    await inspector.getByRole("button", { name: "Save input map", exact: true }).click(); expect((await saved).ok()).toBe(true);
    const canonical = await ok<MapReceipt>("input.map.inspect", { assetGuid: created.asset.guid });
    expect(canonical.revision).not.toBe(remote.revision); expect(binding(canonical).bindings[0]).toMatchObject({ code: "KeyJ" });
    expect((await call("input.map.save", { assetGuid: created.asset.guid, baseRevision: remote.revision, document: remote.document, apply: true })).isError).toBe(true);
    await reopen(); await page.getByRole("tab", { name: "Game", exact: true }).click();
    const transport = (action: string) => ok("editor.transport", { sessionId, action });
    const ui = page.locator('[data-runtime-input-surface] [data-braze-ui]');
    const tap = async (key: string) => {
      await page.getByLabel("Game render viewport", { exact: true }).click({ position: { x: 20, y: 20 } });
      await page.keyboard.press(key);
    };
    await transport("play"); await expect(ui.getByText("0 points", { exact: true })).toBeVisible();
    await expect.poll(async () => (await stockControlPixels(page)).orange.count).toBeGreaterThan(100);
    // Selecting another saved asset cannot replace the active Play snapshot.
    await ok("input.project.select", { assetGuid: alternate.asset.guid, baseRevision: selected.revision, apply: true });
    await tap("j"); await expect(ui.getByText(/^[1-9][0-9]* points$/)).toBeVisible();
    await transport("stop"); await transport("play"); await expect(ui.getByText("0 points", { exact: true })).toBeVisible();
    await tap("k"); await expect(ui.getByText(/^[1-9][0-9]* points$/)).toBeVisible();
    await page.screenshot({ path: info.outputPath("input-map-alternate-game.png") });
    await transport("pause"); await transport("step"); await transport("stop");
    const finalSelection = await ok<{ revision: string }>("input.project.inspect");
    await ok("input.project.select", { assetGuid: null, baseRevision: finalSelection.revision, apply: true });
    await transport("play"); await expect(ui.getByText("0 points", { exact: true })).toBeVisible();
    await tap("e"); await expect(ui.getByText(/^[1-9][0-9]* points$/)).toBeVisible(); await transport("stop");
    expect(binding(await ok<MapReceipt>("input.map.inspect", { assetGuid: alternate.asset.guid })).bindings[0]).toMatchObject({ code: "KeyK" });
  } finally { await client.close(); }
});
