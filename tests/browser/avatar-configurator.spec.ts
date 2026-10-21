import { expect, test } from "playwright/test";
import { installCharacterFixture } from "./fixtures/character-authoring";
import { readCharacterTheme } from "./fixtures/character-theme";

test("opens Avatar Configuration as an opaque full-workspace editor", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installCharacterFixture(page);
  await page.goto("/");
  await page.locator(".model-tile").filter({ hasText: "Hero Character" }).click();
  await page.getByRole("tab", { name: "Rig", exact: true }).click();
  await page.getByLabel("Animation Type", { exact: true }).selectOption("humanoid");
  await page.getByRole("button", { name: "Configure Avatar", exact: true }).click();

  const configurator = page.getByRole("dialog", { name: "Avatar Configuration", exact: true });
  await expect(configurator).toBeVisible();
  await expect(configurator.getByText("Model Import", { exact: true })).toBeVisible();
  await expect(configurator.getByText("Humanoid Rig", { exact: true })).toBeVisible();
  await expect(configurator.getByText("Hero Character", { exact: true })).toBeVisible();
  await expect(configurator.locator(".skeleton-hierarchy").getByText("Skeleton", { exact: true })).toBeVisible();
  await expect(configurator.getByRole("tab", { name: "Mapping", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(configurator.getByText("Avatar Map", { exact: true })).toBeVisible();
  await expect(configurator.locator(".humanoid-map__artwork-layer")).toHaveCount(8);
  await expect(configurator.locator(".humanoid-map__point")).toHaveCount(22);
  await expect(configurator.getByText("Humanoid role", { exact: true })).toBeVisible();
  await expect(configurator.getByText("Drop bone from Skeleton", { exact: true })).toBeVisible();
  await expect(configurator.getByText(/Drag bones from Skeleton into these roles/)).toBeVisible();
  await expect(configurator.locator(".avatar-configurator__panel")).toBeFocused();
  const leftUpperArmPoint = configurator.getByRole("button", { name: "Left Upper Arm: required and missing", exact: true });
  await expect(leftUpperArmPoint).toBeVisible();
  await leftUpperArmPoint.click();
  await expect(leftUpperArmPoint).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#root")).toHaveCSS("display", "none");
  await expect(configurator.locator(".avatar-configurator__mapping select")).toHaveCount(0);
  await expect(configurator.locator(".avatar-configurator__mapping .avatar-bone-select")).toHaveCount(0);
  expect(await configurator.locator(".humanoid-bone-drop-slot").count()).toBeGreaterThan(15);
  const leftUpperArmSlot = configurator.locator('.humanoid-bone-drop-slot[data-role="leftUpperArm"]');
  const leftUpperArmRow = leftUpperArmSlot.locator("..");
  const theme = await readCharacterTheme(page);
  const missingMarkerFilter = await leftUpperArmPoint.locator(".humanoid-map__marker").evaluate((marker) => getComputedStyle(marker).filter);
  await expect(leftUpperArmSlot).toHaveAttribute("data-state", "missing");
  await expect(leftUpperArmRow.locator(".avatar-configurator__mapping-role")).toHaveCSS("color", theme.danger);

  const helperBone = configurator.locator(".skeleton-hierarchy__bone").filter({ hasText: "HelperBone" });
  await expect(helperBone).toHaveAttribute("draggable", "true");
  expect(Number.parseFloat(await helperBone.evaluate((button) => getComputedStyle(button).fontSize))).toBeGreaterThanOrEqual(13);
  await helperBone.dragTo(leftUpperArmSlot);

  await expect(leftUpperArmSlot).toHaveAttribute("data-state", "mapped");
  await expect(leftUpperArmSlot).toContainText("HelperBone");
  await expect(leftUpperArmRow.locator(".avatar-configurator__mapping-role")).toHaveCSS("color", theme.success);
  const mappedUpperArmPoint = configurator.getByRole("button", { name: "Left Upper Arm: mapped", exact: true });
  await expect(mappedUpperArmPoint).toHaveAttribute("data-state", "mapped");
  expect(await mappedUpperArmPoint.locator(".humanoid-map__marker").evaluate((marker) => getComputedStyle(marker).filter))
    .not.toBe(missingMarkerFilter);
  const helperRow = configurator.locator(".skeleton-hierarchy__row").filter({ hasText: "HelperBone" });
  await expect(helperRow).toHaveAttribute("data-state", "mapped");
  await expect(helperRow.locator(".skeleton-hierarchy__bone > span")).toHaveCSS("color", theme.success);

  await configurator.getByRole("tab", { name: "Left Hand", exact: true }).click();
  await expect(configurator.getByText("Left Fingers", { exact: true })).toBeVisible();
  await expect(configurator.getByRole("button", { name: "Left Thumb Proximal", exact: true })).toBeVisible();
  await configurator.getByRole("tab", { name: "Muscles & Settings", exact: true }).click();
  await expect(configurator.getByText("Rig Roots", { exact: true })).toBeVisible();
  await expect(configurator.getByRole("slider", { name: "Arm stretch", exact: true })).toBeVisible();
  await expect(configurator.getByRole("switch", { name: "Translation degrees of freedom", exact: true })).toBeVisible();
  await configurator.getByRole("tab", { name: "Mapping", exact: true }).click();
  await configurator.getByRole("tab", { name: "Body", exact: true }).click();
  await expect(configurator.locator(".humanoid-map__canvas svg")).toHaveAttribute("data-region", "body");

  const bounds = await configurator.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.x).toBeCloseTo(0, 0);
  expect(bounds!.y).toBeCloseTo(0, 0);
  expect(bounds!.width).toBeCloseTo(viewport!.width, 0);
  expect(bounds!.height).toBeCloseTo(viewport!.height, 0);

  const skeletonBounds = await configurator.locator(".skeleton-hierarchy").boundingBox();
  const editorBounds = await configurator.locator(".avatar-configurator__editor").boundingBox();
  const settingsBounds = await configurator.locator(".avatar-configurator__settings").boundingBox();
  expect(skeletonBounds).not.toBeNull();
  expect(editorBounds).not.toBeNull();
  expect(settingsBounds).not.toBeNull();
  expect(editorBounds!.x).toBeCloseTo(skeletonBounds!.x + skeletonBounds!.width, 0);
  expect(settingsBounds!.x).toBeCloseTo(editorBounds!.x, 0);
  expect(settingsBounds!.width).toBeCloseTo(editorBounds!.width, 0);
  expect(settingsBounds!.width).toBeGreaterThan(skeletonBounds!.width);
  await expect(configurator.locator(".avatar-configurator__stage")).toBeHidden();

  const backgrounds = await configurator.evaluate((root) => [
    root,
    root.querySelector(".avatar-configurator__panel"),
    root.querySelector(".avatar-configurator__workspace"),
    root.querySelector(".avatar-configurator__settings"),
  ].map((element) => element ? getComputedStyle(element).backgroundColor : "missing"));
  expect(backgrounds).not.toContain("missing");
  expect(backgrounds.every((color) => color !== "rgba(0, 0, 0, 0)" && color !== "transparent")).toBe(true);
  await expect(page.locator(".avatar-configurator__backdrop")).toHaveCount(0);

  await configurator.getByRole("tab", { name: "3D Preview", exact: true }).click();
  await expect(configurator.getByRole("tab", { name: "3D Preview", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(configurator.locator(".avatar-configurator__settings")).toBeHidden();
  const previewBounds = await configurator.locator(".character-preview-workspace").boundingBox();
  expect(previewBounds).not.toBeNull();
  expect(previewBounds!.x).toBeCloseTo(editorBounds!.x, 0);
  expect(previewBounds!.width).toBeCloseTo(editorBounds!.width, 0);

  const player = configurator.getByRole("group", { name: "Animation preview player", exact: true });
  await expect(player).toBeVisible();
  const previewPlay = player.getByRole("button", { name: "Play animation preview", exact: true });
  const previewTimeline = player.getByRole("slider", { name: "Animation timeline", exact: true });
  await expect(previewPlay).toBeEnabled();
  await expect(previewTimeline).toBeEnabled();
  await previewPlay.click();
  await expect(player.getByRole("button", { name: "Pause animation preview", exact: true })).toBeVisible();
  const timelineTrack = player.locator(".editor-range-control__track");
  await expect(timelineTrack).toBeVisible();
  const timelineStyle = await timelineTrack.evaluate((track) => {
    const style = getComputedStyle(track);
    return { height: track.getBoundingClientRect().height, backgroundColor: style.backgroundColor };
  });
  expect(timelineStyle.height).toBeLessThanOrEqual(4);
  expect(timelineStyle.backgroundColor).not.toBe("rgb(255, 255, 255)");

  await configurator.getByRole("button", { name: "Grid settings", exact: true }).click();
  const gridSettings = page.getByRole("dialog", { name: "Grid settings", exact: true });
  await expect(gridSettings.getByRole("checkbox", { name: "Show grid", exact: true })).toBeChecked();
  await expect(gridSettings.getByLabel("Grid opacity", { exact: true })).toHaveValue("0.25");
  await gridSettings.getByRole("checkbox", { name: "Show grid", exact: true }).uncheck();
  await expect(gridSettings.getByLabel("Grid opacity", { exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(gridSettings).toHaveCount(0);
  await expect(configurator).toBeVisible();

  await configurator.getByRole("button", { name: "Close", exact: true }).click();
  await expect(configurator).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveCSS("display", "none");
  await expect(page.getByRole("button", { name: "Configure Avatar", exact: true })).toBeFocused();
});
