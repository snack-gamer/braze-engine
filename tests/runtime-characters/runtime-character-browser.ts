import { expect, type APIRequestContext, type Page } from "playwright/test";
import { DEFAULT_DOCK_DOCUMENT, dockPane } from "../../src/docking/layout";
import { DOCK_STORAGE_KEY } from "../../src/docking/dock-persistence";
import type {} from "../gameplay/fixtures/runtime-character-game";

export const characterPanel = (page: Page) => page.getByRole("complementary", { name: "Runtime character review" });
export const renderGap = (page: Page) => page.evaluate(async () => { for (let frame = 0; frame < 8; frame++) await new Promise(requestAnimationFrame); });
export const characterSample = (page: Page) => page.evaluate(() => {
  const probe = window.runtimeCharacterProbe;
  return probe.actors.map((actor, index) => {
    const handle = probe.handle(index)!, motor = probe.state(index);
    return { handle: { slot: handle.slot, generation: handle.generation }, animated: actor.animated, pooled: actor.pooled,
      result: motor?.result, initial: motor?.initial, ticks: motor?.ticks ?? 0, maxY: motor?.maxY ?? 0, speed: motor?.speed ?? 0 };
  });
});

export async function openCharacterEditor(page: Page, request: APIRequestContext) {
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

export async function waitForCharacters(page: Page, count: number) {
  await expect(characterPanel(page)).toContainText(`Characters: ${count}`);
  await expect.poll(async () => (await characterSample(page)).filter((actor) => actor.result?.grounded).length).toBe(count);
}
