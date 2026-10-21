import { expect, test } from "playwright/test";
import {
  DEFAULT_DOCK_DOCUMENT,
  activateDockPane,
  dockPane,
  openDockPane,
} from "../../src/docking/layout";
import { DOCK_STORAGE_KEY } from "../../src/docking/dock-persistence";
import { installCharacterFixture } from "./fixtures/character-authoring";

test("live Animator parameters keep updating Scene while Game is also visible", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const withAnimator = openDockPane(DEFAULT_DOCK_DOCUMENT, "animator");
  const withGameBesideScene = dockPane(withAnimator, "game", "inspector", "center");
  const initialLayout = activateDockPane(withGameBesideScene, "inspector");
  await page.addInitScript(({ key, layout }) => {
    window.localStorage.setItem(key, JSON.stringify(layout));
  }, { key: DOCK_STORAGE_KEY, layout: initialLayout });
  await installCharacterFixture(page);
  await page.goto("/");

  const inspector = page.locator("#editor-dock-surface-inspector");
  await inspector.getByRole("button", { name: "Add Component", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Add Component", exact: true });
  await palette.getByRole("searchbox", { name: "Search palette", exact: true }).fill("Animator");
  await palette.getByRole("button", { name: "Animator Controller", exact: true }).click();
  await inspector.getByRole("button", { name: "Build from 1 Clip", exact: true }).click();
  await inspector.getByRole("button", { name: /Hero Character Controller/ }).click();

  const behaviorMap = page.locator("#editor-dock-surface-animator");
  await behaviorMap.getByRole("button", { name: "Add parameter", exact: true }).click();
  await behaviorMap.getByRole("menu", { name: "Parameter types", exact: true })
    .getByRole("menuitem", { name: "Float", exact: true }).click();
  const parameterName = behaviorMap.getByLabel("Parameter name", { exact: true });
  await parameterName.fill("Speed");
  await parameterName.press("Enter");
  await behaviorMap.getByRole("button", { name: "Select Speed parameter", exact: true }).click();

  const parameterInspector = behaviorMap.getByRole("complementary", {
    name: "Animator context inspector",
    exact: true,
  });
  const liveSimulation = parameterInspector.locator(".animator-inspector-section").filter({
    hasText: "Live simulation",
  });
  const currentValue = liveSimulation.getByLabel("Current parameter value", { exact: true });

  await page.getByLabel("Enter Play Mode", { exact: true }).click();
  await expect(liveSimulation.getByText("Running", { exact: true })).toBeVisible();
  await expect(currentValue).toHaveValue("0.00");

  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await expect(page.getByRole("application", { name: "Game view — playing", exact: true }))
    .toBeVisible();
  await expect(liveSimulation.getByText("Running", { exact: true })).toBeVisible();
  await currentValue.fill("0.75");
  await currentValue.press("Enter");
  await expect(currentValue).toHaveValue("0.75");

  await page.getByRole("tab", { name: "Inspector", exact: true }).click();
  await expect(page.locator("#editor-dock-surface-game")).toBeHidden();
  await expect(liveSimulation.getByText("Running", { exact: true })).toBeVisible();
  await expect(currentValue).toHaveValue("0.75");
});
