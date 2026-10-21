import { expect, test, type APIRequestContext, type Page } from "playwright/test";
import { DEFAULT_DOCK_DOCUMENT, dockPane } from "../../src/docking/layout";
import { DOCK_STORAGE_KEY } from "../../src/docking/dock-persistence";
import { buildInputMapPlayer, INPUT_PLAYER_SUBPATH } from "./static-player-export.mjs";
import type {} from "../gameplay/fixtures/input-action-map-game";

const inspector = (page: Page) => page.locator(".input-map");
const liveCode = (page: Page) => page.evaluate(() => {
  const binding = window.inputActionMapProbe?.bindings()?.actions[0]?.bindings[0];
  return binding?.device === "keyboard" ? binding.code : undefined;
});

async function editorCommands(page: Page, request: APIRequestContext) {
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const invoke = async (operation: string, values = {}) => {
    const result = await (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" },
      data: { version: 1, requestId: crypto.randomUUID(), sessionId, operation, ...values } })).json();
    expect(result.status, JSON.stringify(result)).toBe("ok"); return result.result;
  };
  await expect.poll(async () => (await invoke("editor.status")).loaded).toBe(true);
  return invoke;
}

async function tap(page: Page, key: string, responds: boolean) {
  await page.getByLabel("Game render viewport", { exact: true }).click({ position: { x: 30, y: 30 } });
  const before = await page.evaluate(() => window.inputActionMapProbe.presses);
  await page.keyboard.press(key);
  // Browser automation can span several fixed ticks before the key is sent.
  // Require subsequent ticks to consume its edge and prove it fires only once.
  const afterKey = await page.evaluate(() => window.inputActionMapProbe.ticks);
  await expect.poll(() => page.evaluate(() => window.inputActionMapProbe.ticks)).toBeGreaterThanOrEqual(afterKey + 3);
  expect(await page.evaluate(() => window.inputActionMapProbe.presses)).toBe(before + Number(responds));
}

async function saveMap(page: Page) {
  const response = page.waitForResponse((reply) => new URL(reply.url()).pathname === "/api/assets/input-action-map" && reply.request().method() === "PUT");
  await inspector(page).getByRole("button", { name: "Save input map", exact: true }).click();
  const result = await (await response).json(); expect(result.status, JSON.stringify(result)).toBe("ok");
  await expect(inspector(page).getByRole("button", { name: "Save input map", exact: true })).toBeDisabled();
  return result;
}

test("create, save, select and reload controls; immutable Play capture; relative static export", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(({ key, layout }) => localStorage.setItem(key, JSON.stringify(layout)), {
    key: DOCK_STORAGE_KEY, layout: dockPane(DEFAULT_DOCK_DOCUMENT, "game", "scene", "bottom"),
  });
  await page.goto("/"); let invoke = await editorCommands(page, request);
  await page.getByRole("button", { name: "Create or import into Assets", exact: true }).click();
  const creation = page.waitForResponse((reply) => new URL(reply.url()).pathname === "/api/assets/input-action-map" && reply.request().method() === "POST");
  await page.getByRole("dialog", { name: "Create", exact: true }).getByRole("button", { name: "Input Action Map", exact: true }).click();
  const created = await (await creation).json(); expect(created.status, JSON.stringify(created)).toBe("ok");
  await expect(inspector(page).getByRole("heading", { name: "Input Action Map", exact: true })).toBeVisible();
  await inspector(page).getByLabel("Asset name", { exact: true }).fill("Saved Controls");
  await inspector(page).getByRole("button", { name: "Add action", exact: true }).click();
  await inspector(page).getByLabel("Action 1 name", { exact: true }).fill("fire");
  await inspector(page).getByLabel("Action 1 kind", { exact: true }).selectOption("button");
  await inspector(page).getByRole("button", { name: "Add binding to action 1", exact: true }).click();
  await inspector(page).getByLabel("Action 1 binding 1 device", { exact: true }).selectOption("keyboard");
  await inspector(page).getByLabel("Action 1 binding 1 keyboard code", { exact: true }).fill("KeyJ");
  let firstSaved = await saveMap(page);
  expect(firstSaved.document.map.actions[0]).toMatchObject({ name: "fire", kind: "button", bindings: [{ device: "keyboard", code: "KeyJ" }] });
  const sourceUrl = `/api/assets/input-action-map?${new URLSearchParams({ filename: created.asset.filename })}`;
  await inspector(page).getByLabel("Action 1 binding 1 keyboard code", { exact: true }).fill("KeyM");
  const remoteDocument = { ...firstSaved.document, map: { version: 1, actions: [{ name: "fire", kind: "button", bindings: [{ device: "keyboard", code: "KeyL" }] }] } };
  const externalSave = await request.put(sourceUrl, { data: { document: remoteDocument, baseRevision: firstSaved.revision, assetGuid: created.asset.guid } });
  expect(externalSave.ok()).toBe(true);
  const conflict = page.waitForResponse((reply) => new URL(reply.url()).pathname === "/api/assets/input-action-map" && reply.request().method() === "PUT");
  await inspector(page).getByRole("button", { name: "Save input map", exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(inspector(page).getByRole("alert")).toContainText("changed on disk");
  await expect(inspector(page).getByLabel("Action 1 binding 1 keyboard code", { exact: true })).toHaveValue("KeyM");
  await inspector(page).getByRole("button", { name: "Revert input map", exact: true }).click();
  await expect(inspector(page).getByLabel("Action 1 binding 1 keyboard code", { exact: true })).toHaveValue("KeyL");
  await inspector(page).getByLabel("Action 1 binding 1 keyboard code", { exact: true }).fill("KeyJ");
  firstSaved = await saveMap(page);
  await inspector(page).getByRole("button", { name: "Use for project", exact: true }).click();
  await expect(inspector(page).getByLabel("Project input map", { exact: true })).toHaveValue(created.asset.guid);
  await expect.poll(async () => (await (await request.get("/api/project")).json()).project.input?.actionMap?.guid).toBe(created.asset.guid);

  await page.reload(); invoke = await editorCommands(page, request);
  await page.locator(".input-asset-tile").dblclick();
  await expect(inspector(page).getByLabel("Action 1 binding 1 keyboard code", { exact: true })).toHaveValue("KeyJ");
  await expect(inspector(page).getByLabel("Project input map", { exact: true })).toHaveValue(created.asset.guid);
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await page.screenshot({ path: "/tmp/braze-input-action-map-editor.png" });
  const play = async (code: string) => {
    const before = await page.evaluate(() => window.inputActionMapProbe?.creates ?? 0);
    await invoke("editor.transport", { action: "play" });
    await expect.poll(() => page.evaluate(() => window.inputActionMapProbe?.creates ?? 0)).toBe(before + 1);
    await expect.poll(() => liveCode(page)).toBe(code);
  };
  const stop = async () => {
    await invoke("editor.transport", { action: "stop" });
    await expect.poll(() => page.evaluate(() => window.inputActionMapProbe.context?.signal.aborted)).toBe(true);
  };
  await play("KeyJ"); await tap(page, "j", true); await tap(page, "i", false);

  // Saved edits made during Play become the next capture; the current session retains KeyJ.
  await inspector(page).getByLabel("Action 1 binding 1 keyboard code", { exact: true }).fill("KeyK");
  const nextSaved = await saveMap(page); expect(nextSaved.revision).not.toBe(firstSaved.revision);
  expect(await liveCode(page)).toBe("KeyJ"); await tap(page, "j", true); await tap(page, "k", false);
  await page.getByRole("complementary", { name: "Input Action Map review" }).getByRole("button", { name: "Rebind fire to R", exact: true }).click();
  expect(await liveCode(page)).toBe("KeyR"); await tap(page, "j", false); await tap(page, "r", true);
  const afterRebind = await (await request.get(sourceUrl)).json();
  expect(afterRebind.document).toEqual(nextSaved.document); expect(afterRebind.revision).toBe(nextSaved.revision);
  await stop(); await play("KeyK"); await tap(page, "k", true); await tap(page, "r", false); await stop();

  await inspector(page).getByRole("button", { name: "Clear project input map", exact: true }).click();
  await expect(inspector(page).getByLabel("Project input map", { exact: true })).toHaveValue("");
  await play("KeyI"); await tap(page, "i", true); await tap(page, "k", false); await stop();
  await inspector(page).getByRole("button", { name: "Use for project", exact: true }).click();
  await expect(inspector(page).getByLabel("Project input map", { exact: true })).toHaveValue(created.asset.guid);

  // A missing selected GUID must produce a visible startup failure, never the inline KeyI fallback.
  const project = await (await request.get("/api/project")).json();
  const broken = await request.put("/api/project", { data: { patch: { input: { version: 1, actionMap: { guid: "ff".repeat(16) } } },
    expectedSectionRevisions: { input: project.sectionRevisions.input } } }); expect(broken.ok()).toBe(true);
  await page.reload(); invoke = await editorCommands(page, request); await page.locator(".input-asset-tile").dblclick();
  await expect(inspector(page).getByRole("alert")).toContainText("selected Input Action Map is missing");
  await page.getByRole("tab", { name: "Game", exact: true }).click(); await invoke("editor.transport", { action: "play" });
  await expect(page.locator(".gameplay-failure").first()).toContainText(/Input Action Map.*missing or ambiguous/);
  expect(await page.evaluate(() => window.inputActionMapProbe?.creates ?? 0)).toBe(0);
  await invoke("editor.transport", { action: "stop" });
  await inspector(page).getByRole("button", { name: "Use for project", exact: true }).click();
  await expect(inspector(page).getByLabel("Project input map", { exact: true })).toHaveValue(created.asset.guid);
  await invoke("editor.save");

  await buildInputMapPlayer(process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT);
  const player = await context.newPage(), apis: string[] = [], errors: string[] = [], failures: string[] = [];
  player.on("request", (req) => { if (/\/(api|__braze)\//.test(new URL(req.url()).pathname)) apis.push(req.url()); });
  player.on("pageerror", (error) => errors.push(error.message));
  player.on("response", (reply) => { if (reply.status() >= 400) failures.push(`${reply.status()} ${reply.url()}`); });
  await player.goto(`http://127.0.0.1:4374/${INPUT_PLAYER_SUBPATH}/player.html`);
  await expect.poll(() => liveCode(player)).toBe("KeyK"); await tap(player, "k", true); await tap(player, "i", false);
  await expect(player.locator(".editor-shell, .scene-label-layer, .viewport-hud")).toHaveCount(0);
  expect(apis).toEqual([]); expect(errors).toEqual([]); expect(failures).toEqual([]);
  await player.close();

  // Deleting the final selected source retains its reference, which remains
  // inspectable and clearable without creating another Input Action Map.
  // Export can refresh the editor; reopen the asset through the public browser.
  invoke = await editorCommands(page, request);
  await page.locator(".input-asset-tile").dblclick();
  await expect(inspector(page).getByLabel("Asset name", { exact: true })).toHaveValue("Saved Controls");
  await expect(inspector(page).getByLabel("Action 1 binding 1 keyboard code", { exact: true })).toHaveValue("KeyK");
  await expect(inspector(page).getByLabel("Project input map", { exact: true })).toHaveValue(created.asset.guid);
  await inspector(page).getByRole("button", { name: "Delete input map", exact: true }).click();
  const deletion = page.getByRole("dialog", { name: "Delete Input Action Map", exact: true });
  await expect(deletion).toContainText("Project input uses this map");
  await expect(deletion).toContainText("Its saved GUID remains");
  await deletion.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".input-asset-tile")).toHaveCount(0);
  await expect.poll(async () => (await (await request.get("/api/project")).json()).project.input?.actionMap?.guid)
    .toBe(created.asset.guid);
  await page.getByRole("button", { name: "Create or import into Assets", exact: true }).click();
  await page.getByRole("dialog", { name: "Create", exact: true })
    .getByRole("button", { name: "Project Input Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Project Input Settings", exact: true });
  await expect(settings.getByLabel("Project input map", { exact: true })).toHaveValue(created.asset.guid);
  await expect(settings.getByRole("alert")).toContainText("selected Input Action Map is missing");
  await settings.getByRole("button", { name: "Clear project input map", exact: true }).click();
  await expect(settings.getByLabel("Project input map", { exact: true })).toHaveValue("");
  await expect.poll(async () => (await (await request.get("/api/project")).json()).project.input?.actionMap)
    .toBeUndefined();
  await settings.getByRole("button", { name: "Close Project Input Settings", exact: true }).click();
  await expect(page.locator(".input-asset-tile")).toHaveCount(0);
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await play("KeyI"); await tap(page, "i", true); await tap(page, "k", false); await stop();
});
