import { expect, test } from "playwright/test";

test("Game statistics stay anchored to the pane instead of the preview frame", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("braze.editor.game-view-aspect.v1", JSON.stringify({
      activePresetId: "aspect-16-9",
      lowResolution: false,
      customPresets: [],
    }));
  });
  await page.route("**/api/**", async (route) => {
    const method = route.request().method();
    if (method === "GET" || method === "HEAD") await route.continue();
    else await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  const stats = page.getByRole("region", { name: "Viewport statistics", exact: true });
  await expect(stats).toBeVisible();
  await page.setViewportSize({ width: 900, height: 900 });

  const layout = await page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>(".game-view")!;
    const frame = pane.querySelector<HTMLElement>(".game-view__frame")!;
    const hud = document.querySelector<HTMLElement>(".viewport-hud")!;
    const paneBounds = pane.getBoundingClientRect();
    const hudBounds = hud.getBoundingClientRect();
    return {
      directChild: hud.parentElement === pane,
      insidePreview: frame.contains(hud),
      paneTopInset: hudBounds.top - paneBounds.top,
      paneRightInset: paneBounds.right - hudBounds.right,
    };
  });

  expect(layout.directChild).toBe(true);
  expect(layout.insidePreview).toBe(false);
  expect(layout.paneTopInset).toBeGreaterThan(0);
  expect(layout.paneTopInset).toBeLessThan(20);
  expect(layout.paneRightInset).toBeGreaterThan(0);
  expect(layout.paneRightInset).toBeLessThan(20);
});
