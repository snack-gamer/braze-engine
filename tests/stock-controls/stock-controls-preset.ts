import { expect, type APIRequestContext, type Page } from "playwright/test";

/** Author the stock map through its inspector; the preset remains a draft until Save. */
export async function saveStockPresetFromInspector(page: Page, request: APIRequestContext) {
  const sourceUrl = `/api/assets/input-action-map?${new URLSearchParams({ filename: "Stock Controls.braze-input.json" })}`;
  const readSource = async () => {
    const response = await request.get(sourceUrl); expect(response.ok()).toBe(true); return response.json();
  };
  const before = await readSource(), selection = (await (await request.get("/api/project")).json()).project.input;
  expect(selection.actionMap.guid).toBe(before.asset.guid);
  expect(before.document.map.actions[0].bindings.map((binding: { device: string }) => binding.device)).toEqual(["keyboard", "keyboard"]);
  await page.locator(".input-asset-tile").dblclick();
  const inspector = page.locator(".input-map"), save = inspector.getByRole("button", { name: "Save input map", exact: true });
  await expect(inspector.getByRole("heading", { name: "Input Action Map", exact: true })).toBeVisible();
  await expect(inspector.getByLabel("Project input map", { exact: true })).toHaveValue(before.asset.guid);
  await expect(save).toBeDisabled();
  await inspector.getByRole("button", { name: "Use character controls preset", exact: true }).click();
  await expect(save).toBeEnabled();
  await expect(inspector.getByLabel("Action 1 binding 3 device", { exact: true })).toHaveValue("gamepad-axis");
  await expect(inspector.getByLabel("Action 3 binding 2 device", { exact: true })).toHaveValue("gamepad-button");
  const unsaved = await readSource();
  expect(unsaved.document).toEqual(before.document); expect(unsaved.revision).toBe(before.revision);
  expect((await (await request.get("/api/project")).json()).project.input).toEqual(selection);
  const savedReply = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/assets/input-action-map"
    && response.request().method() === "PUT");
  await save.click();
  const saved = await (await savedReply).json(); expect(saved.status, JSON.stringify(saved)).toBe("ok");
  await expect(save).toBeDisabled();
  expect(saved.revision).not.toBe(before.revision);
  const actions = saved.document.map.actions;
  expect(actions).toHaveLength(7);
  expect(actions).toMatchObject([
    { name: "moveX", kind: "axis", bindings: [{ device: "keyboard", code: "KeyA", scale: -1 }, { device: "keyboard", code: "KeyD" }, { device: "gamepad-axis", axis: 0 }] },
    { name: "moveZ", kind: "axis", bindings: [{ device: "keyboard", code: "KeyW" }, { device: "keyboard", code: "KeyS", scale: -1 }, { device: "gamepad-axis", axis: 1, scale: -1 }] },
    { name: "jump", kind: "button", bindings: [{ device: "keyboard", code: "Space" }, { device: "gamepad-button", button: 0 }] },
    { name: "lookX", kind: "delta", bindings: [{ device: "pointer-delta", axis: "x" }] },
    { name: "lookY", kind: "delta", bindings: [{ device: "pointer-delta", axis: "y" }] },
    { name: "lookRateX", kind: "axis", bindings: [{ device: "gamepad-axis", axis: 2 }] },
    { name: "lookRateY", kind: "axis", bindings: [{ device: "gamepad-axis", axis: 3 }] },
  ]);
  expect((await readSource()).document).toEqual(saved.document);
  expect((await (await request.get("/api/project")).json()).project.input).toEqual(selection);
  await expect(inspector.getByLabel("Project input map", { exact: true })).toHaveValue(before.asset.guid);
  await page.getByRole("tab", { name: "Game", exact: true }).click();
}
