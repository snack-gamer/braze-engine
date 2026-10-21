import { expect, test } from "playwright/test";
import { installCharacterFixture } from "./fixtures/character-authoring";
import { readCharacterTheme } from "./fixtures/character-theme";

test("traces global Play Mode in the compact, scroll-zoomable Behavior Map", async ({ page }) => {
  await installCharacterFixture(page);
  await page.goto("/");

  const inspector = page.locator(".rail-right");
  await inspector.getByRole("button", { name: "Add Component", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Add Component", exact: true });
  await palette.getByRole("searchbox", { name: "Search palette", exact: true }).fill("Animator");
  await palette.getByRole("button", { name: "Animator Controller", exact: true }).click();
  await inspector.getByRole("button", { name: "Build from 1 Clip", exact: true }).click();
  await inspector.getByRole("button", { name: /Hero Character Controller/ }).click();

  const editor = page.locator("#editor-dock-surface-animator");
  const graphViewport = editor.locator(".animator-graph-viewport");
  const zoomLevel = editor.getByTitle("Reset graph view", { exact: true });
  const graphControls = editor.getByRole("toolbar", { name: "Graph view controls", exact: true });
  await expect(graphViewport).toBeVisible();
  await expect(zoomLevel).toHaveText("100%");
  await expect(editor.locator(".animator-workspace__toolbar").getByRole("button", { name: "Clip", exact: true })).toHaveCount(0);
  await expect(graphControls.getByRole("button", { name: "Auto Arrange", exact: true })).toBeVisible();
  const clipProgress = editor.getByRole("progressbar", { name: "Playback progress for Idle", exact: true });
  await expect(editor.getByRole("button", { name: "Run", exact: true })).toHaveCount(0);
  await expect(editor.getByTitle("Reset simulation", { exact: true })).toHaveCount(0);
  await expect(clipProgress).toHaveCount(0);
  await page.getByLabel("Enter Play Mode", { exact: true }).click();
  await expect.poll(async () => Number(await clipProgress.getAttribute("aria-valuenow"))).toBeGreaterThan(2);
  await page.getByLabel("Pause", { exact: true }).click();
  await page.waitForTimeout(100);
  const pausedProgress = await clipProgress.getAttribute("aria-valuenow");
  await page.waitForTimeout(120);
  await expect(clipProgress).toHaveAttribute("aria-valuenow", pausedProgress ?? "");
  await page.getByLabel("Exit Play Mode", { exact: true }).click();
  await expect(clipProgress).toHaveCount(0);
  const addLayer = editor.getByTitle("Add layer", { exact: true });
  const layerRows = editor.locator(".animator-rail-section").first().locator(".animator-rail-row");
  await addLayer.click();
  await expect(layerRows).toHaveCount(2);
  await addLayer.click();
  await expect(layerRows).toHaveCount(3);
  await expect(editor.locator(".animator-workspace__issue-badge")).toHaveCount(0);
  await page.getByRole("button", { name: "Open Console", exact: true }).click();
  const consoleWindow = page.getByLabel("Editor Console", { exact: true });
  await expect(consoleWindow.locator(".console-window__row").filter({
    hasText: "has no valid default state or child machine.",
  })).toHaveCount(2);
  await page.getByRole("button", { name: "Close Console", exact: true }).click();
  const headerMetrics = await editor.locator(".animator-workspace__toolbar").evaluate((header) => {
    const name = header.querySelector<HTMLElement>('[aria-label="Animator Controller name"]')!;
    const body = document.querySelector<HTMLElement>("#editor-dock-surface-animator .animator-workspace__body")!;
    const viewport = document.querySelector<HTMLElement>("#editor-dock-surface-animator .animator-graph-viewport")!;
    return {
      height: Math.round(header.getBoundingClientRect().height),
      nameHeight: Math.round(name.getBoundingClientRect().height),
      graphHeaderCount: document.querySelectorAll("#editor-dock-surface-animator .animator-graph-toolbar").length,
      stackHeight: Math.round(body.getBoundingClientRect().top - header.getBoundingClientRect().top),
      viewportOffset: Math.round(viewport.getBoundingClientRect().top - body.getBoundingClientRect().top),
    };
  });
  const theme = await readCharacterTheme(page);
  expect(headerMetrics).toEqual({ height: theme.controlHeight, nameHeight: theme.compactHeight, graphHeaderCount: 0, stackHeight: theme.controlHeight, viewportOffset: 0 });
  const viewportBounds = await graphViewport.boundingBox();
  expect(viewportBounds).not.toBeNull();

  await page.mouse.move(
    viewportBounds!.x + viewportBounds!.width / 2,
    viewportBounds!.y + viewportBounds!.height / 2,
  );
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => Number.parseFloat(await zoomLevel.innerText())).toBeGreaterThan(100);

  await zoomLevel.click();
  await page.mouse.move(
    viewportBounds!.x + viewportBounds!.width / 2,
    viewportBounds!.y + viewportBounds!.height / 2,
  );
  await page.mouse.wheel(0, 200);
  await expect.poll(async () => Number.parseFloat(await zoomLevel.innerText())).toBeLessThan(100);
});
