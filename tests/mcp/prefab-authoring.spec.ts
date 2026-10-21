import { expect, test } from "playwright/test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { fileURLToPath } from "node:url";

type Receipt = { revision: string; applied: boolean; valid: boolean; asset: { guid: string; filename: string }; runtimeSubset: { supported: boolean }; items: { id: string; name: string }[]; nextOffset: number | null };
test("MCP prefab authoring shares Prefab Mode revisions and retains identity", async ({ page, request }) => {
  const client = new Client({ name: "prefab-authoring-regression", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL("../../scripts/engine-mcp.mjs", import.meta.url))], env: { BRAZE_ENGINE_URL: "http://127.0.0.1:4373" } }));
  const call = (operation: string, args = {}) => client.callTool({ name: `braze_${operation.replaceAll(".", "_")}`, arguments: args });
  const ok = async (operation: string, args = {}) => {
    const reply = await call(operation, args); expect(reply.isError, JSON.stringify(reply)).not.toBe(true); return reply.structuredContent!.result as Receipt;
  };
  try {
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    expect(tools).toEqual(expect.arrayContaining(["braze_prefab_create", "braze_prefab_inspect", "braze_prefab_edit"]));
    const create = { name: "MCP Cargo", folder: "Reusable", commands: [
      { op: "object.create", id: "cargo", primitive: "cube", values: { parentId: "root", position: [0, 0, 0] } },
      { op: "component.set", id: "cargo", component: "rigidbody", values: { interpolation: "none" } },
      { op: "component.set", id: "cargo", component: "collider", values: { id: "cargo-box", shape: "box" } },
    ] };
    expect(await ok("prefab.create", create)).toMatchObject({ applied: false, valid: true, asset: null, runtimeSubset: { supported: true } });
    const created = await ok("prefab.create", { ...create, apply: true });
    const identity = { assetGuid: created.asset.guid };
    expect(await ok("prefab.inspect", { ...identity, limit: 1 })).toMatchObject({ items: [{ id: "root" }], nextOffset: 1 });
    expect(await ok("prefab.inspect", { ...identity, offset: 1 })).toMatchObject({ items: [{ id: "cargo" }], nextOffset: null });
    const url = `/api/assets/prefab?${new URLSearchParams({ filename: created.asset.filename })}`;
    const manual = await (await request.get(url)).json(); expect(manual.revision).toBe(created.revision);
    const edit = { ...identity, baseRevision: created.revision, commands: [{ op: "object.update", id: "cargo", values: { name: "Agent Cargo" } }] };
    await ok("prefab.edit", edit);
    expect((await (await request.get(url)).json()).revision).toBe(created.revision);
    const changed = await ok("prefab.edit", { ...edit, apply: true }); expect(changed.asset.guid).toBe(created.asset.guid);
    const stale = await call("prefab.edit", { ...edit, apply: true }); expect(stale.isError).toBe(true); expect(stale.structuredContent).toMatchObject({ status: "conflict" });
    expect((await request.put(url, { data: { prefab: manual.prefab, baseRevision: manual.revision } })).status()).toBe(409);
    const bad = await call("prefab.edit", { ...identity, baseRevision: changed.revision, apply: true,
      commands: [{ op: "object.update", id: "cargo", values: { parentId: "cargo" } }] }); expect(bad.isError).toBe(true);
    const fresh = await (await request.get(url)).json(); expect(fresh.prefab.objects[1].name).toBe("Agent Cargo");
    fresh.prefab.objects[1].name = "Manual Cargo";
    expect((await request.put(url, { data: { prefab: fresh.prefab, baseRevision: fresh.revision } })).ok()).toBe(true);
    await page.setViewportSize({ width: 1600, height: 1000 }); await page.goto("/");
    await page.getByRole("button", { name: "All Prefabs", exact: true }).click();
    await page.locator(".prefab-tile").filter({ hasText: "MCP-Cargo" }).click();
    await expect(page.getByTitle("Edit prefab", { exact: true })).toBeVisible();
    await page.locator(".prefab-tile").filter({ hasText: "MCP-Cargo" }).dblclick();
    await expect(page.getByTitle("Edit prefab", { exact: true })).toHaveCount(0);
    await page.locator(".prefab-tile").filter({ hasText: "MCP-Cargo" }).click();
    await expect(page.getByTitle("Edit prefab", { exact: true })).toBeVisible();
    await page.getByTitle("Edit prefab", { exact: true }).click();
    await expect(page.getByLabel("Prefab edit mode", { exact: true })).toBeVisible();
    await page.getByLabel("Prefab edit mode", { exact: true }).getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: /^Undo \(/ }).click();
    await ok("editor.save", { sessionId: await page.locator("html").getAttribute("data-braze-editor-session") });
    const final = await ok("prefab.inspect", identity);
    expect(final.items.map((item) => item.id)).toEqual(["root", "cargo"]); expect(final.items[1].name).toBe("Manual Cargo");
  } finally { await client.close(); }
});
