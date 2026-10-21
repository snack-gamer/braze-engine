import { expect, test } from "playwright/test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UiDocument } from "../../src/game-ui/domain/ui-document";

type Asset = { guid: string; sourcePath: string; status: string };
type Receipt = { applied: boolean; sourceRevision: string; asset: Asset; assetRef: { guid: string; localId: string } };
type Snapshot = { revision: number; items: { id: string; ui_canvas: UiDocument }[] };

test("MCP source imports share manual identity, reject collisions and render after reload", async ({ page, request }, info) => {
  const sources = await mkdtemp(path.join(os.tmpdir(), "braze-mcp-import-"));
  const client = new Client({ name: "source-import-regression", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL("../../scripts/engine-mcp.mjs", import.meta.url))], env: { BRAZE_ENGINE_URL: "http://127.0.0.1:4373" } }));
  const call = (operation: string, args = {}) => client.callTool({ name: `braze_${operation.replaceAll(".", "_")}`, arguments: args });
  const ok = async <T,>(operation: string, args = {}) => {
    const reply = await call(operation, args); expect(reply.isError, JSON.stringify(reply)).not.toBe(true); return reply.structuredContent!.result as T;
  };
  const sourcePath = path.join(sources, "Badge.png"), destination = "Imported/Badge.png";
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  let sessionId = "", previous: UiDocument | undefined;
  const reopen = async () => {
    await page.reload(); await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
    sessionId = (await page.locator("html").getAttribute("data-braze-editor-session"))!;
    await expect.poll(async () => (await ok<{ loaded: boolean }>("editor.status", { sessionId })).loaded).toBe(true);
  };
  try {
    expect((await client.listTools()).tools.some((tool) => tool.name === "braze_assets_import")).toBe(true);
    await writeFile(sourcePath, png);
    const preview = await ok<Receipt>("assets.import", { sourcePath, destination }); expect(preview.applied).toBe(false);
    expect((await ok<{ total: number }>("assets.list", { query: destination })).total).toBe(0);
    await writeFile(sourcePath, "changed bytes");
    const stale = await call("assets.import", { sourcePath, destination, sourceRevision: preview.sourceRevision, apply: true });
    expect(stale.isError).toBe(true); expect(stale.structuredContent).toMatchObject({ status: "conflict" });
    expect((await ok<{ total: number }>("assets.list", { query: destination })).total).toBe(0);
    await writeFile(sourcePath, png);
    const imported = await ok<Receipt>("assets.import", { sourcePath, destination, sourceRevision: preview.sourceRevision, apply: true });
    expect(imported.assetRef.guid).toBe(imported.asset.guid); expect(imported.asset.status).toBe("ready");
    expect((await call("assets.import", { sourcePath, destination, sourceRevision: preview.sourceRevision, apply: true })).isError).toBe(true);
    const collision = await request.post(`/api/assets?${new URLSearchParams({ name: "Badge.png", folder: "Imported", path: "Badge.png" })}`, { data: "replacement bytes" });
    expect(collision.status()).toBe(400); expect((await collision.json()).message).toContain("already exists");
    expect((await ok<{ items: Asset[] }>("assets.list", { query: destination })).items[0].guid).toBe(imported.asset.guid);
    await page.setViewportSize({ width: 1600, height: 1000 }); await page.goto("/"); await reopen();
    await page.locator('input[type=file][accept*=".woff2"]').setInputFiles({ name: "Imported-Manual.ttf", mimeType: "font/ttf", buffer: await readFile(path.resolve("src/styles/fonts/Roboto-Variable.ttf")) });
    let font: Asset | undefined;
    await expect.poll(async () => { font = (await ok<{ items: Asset[] }>("assets.list", { query: "Imported-Manual.ttf" })).items[0]; return font?.status; }).toBe("ready");
    const snapshot = await ok<Snapshot>("editor.inspect", { sessionId }); previous = snapshot.items.find((item) => item.id === "hud")!.ui_canvas;
    const document = { ...previous, root: { ...previous.root, style: { ...previous.root.style, font: { guid: font!.guid } }, children: [...previous.root.children!,
      { id: "imported-badge", kind: "image", image: imported.assetRef, label: "Imported red badge", style: { position: "absolute", right: 32, bottom: 32, width: 64, height: 64 } },
    ] } };
    await ok("editor.edit", { sessionId, baseRevision: snapshot.revision, apply: true, commands: [{ op: "component.set", id: "hud", component: "uiCanvas", values: document }] });
    await ok("editor.select", { sessionId, objectId: "hud" });
    await expect(page.locator('.ui-canvas-preview [data-ui-node=imported-badge]')).toHaveAttribute("data-ui-image", "ready");
    await ok("editor.save", { sessionId }); await reopen();
    await page.getByRole("tab", { name: "Game", exact: true }).click();
    const surface = page.locator("[data-runtime-input-surface] [data-braze-ui]");
    for (let index = 0; index < 2; index++) {
      await ok("editor.transport", { sessionId, action: "play" });
      await expect(surface.locator("[data-ui-node=imported-badge]")).toHaveAttribute("data-ui-image", "ready");
      await expect(surface.locator("[data-ui-node=root]")).toHaveAttribute("data-ui-font", "ready");
      if (index === 0) {
        await page.getByLabel("Game render viewport", { exact: true }).click({ position: { x: 20, y: 20 } }); await page.keyboard.press("e");
        await expect(surface.getByText(/^[1-9][0-9]* points$/)).toBeVisible();
        await page.screenshot({ path: info.outputPath("imported-media-game.png") });
      }
      await ok("editor.transport", { sessionId, action: "stop" });
    }
    expect(errors).toEqual([]);
  } finally {
    if (previous && sessionId) {
      await ok("editor.transport", { sessionId, action: "stop" });
      const snapshot = await ok<Snapshot>("editor.inspect", { sessionId });
      await ok("editor.edit", { sessionId, baseRevision: snapshot.revision, apply: true, commands: [{ op: "component.set", id: "hud", component: "uiCanvas", values: previous }] });
      await ok("editor.save", { sessionId });
    }
    await client.close(); await rm(sources, { recursive: true, force: true });
  }
});
