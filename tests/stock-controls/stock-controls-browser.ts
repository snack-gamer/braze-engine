import { expect, type APIRequestContext, type Page } from "playwright/test";
import { DEFAULT_DOCK_DOCUMENT, dockPane } from "../../src/docking/layout";
import { DOCK_STORAGE_KEY } from "../../src/docking/dock-persistence";

export async function openStockEditor(page: Page, request: APIRequestContext) {
  await page.addInitScript(({ key, layout }) => localStorage.setItem(key, JSON.stringify(layout)), {
    key: DOCK_STORAGE_KEY, layout: dockPane(DEFAULT_DOCK_DOCUMENT, "game", "scene", "bottom"),
  });
  await page.goto("/");
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const invoke = async (operation: string, values = {}) => {
    const reply = await (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" },
      data: { version: 1, requestId: crypto.randomUUID(), sessionId, operation, ...values } })).json();
    expect(reply.status, JSON.stringify(reply)).toBe("ok"); return reply.result;
  };
  await expect.poll(async () => (await invoke("editor.status")).loaded).toBe(true);
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  return invoke;
}

export async function focusStockGame(page: Page) {
  await page.bringToFront();
  await page.getByLabel("Game render viewport", { exact: true }).click({ position: { x: 30, y: 30 } });
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('[aria-label="Game render viewport"]');
    const surface = host?.closest("[data-runtime-input-surface]") ?? host;
    return document.hasFocus() && !document.hidden && Boolean(surface?.contains(document.activeElement));
  })).toBe(true);
}

export async function unlockStockGame(page: Page) {
  await page.evaluate(() => document.exitPointerLock());
  await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
}
