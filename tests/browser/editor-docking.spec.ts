import { expect, test } from "playwright/test";

test("docks a pane across the workspace bottom above the status bar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.removeItem("braze.editor.dock-layout.v3");
    window.localStorage.removeItem("braze.editor.dock-layout.v2");
    window.localStorage.removeItem("braze.editor.dock-layout.v1");
  });
  await page.route("**/api/**", async (route) => {
    const method = route.request().method();
    if (method === "GET" || method === "HEAD") await route.continue();
    else await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/");

  const projectTab = page.getByRole("tab", { name: "Project", exact: true });
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await projectTab.dispatchEvent("dragstart", { dataTransfer: transfer });

  const sceneGroup = page.locator('[data-dock-group-id="scene-group"]');
  const localTarget = sceneGroup.locator(".editor-dock-drop-target");
  const localBounds = await localTarget.boundingBox();
  expect(localBounds).not.toBeNull();
  await localTarget.dispatchEvent("dragover", {
    dataTransfer: transfer,
    clientX: localBounds!.x + 2,
    clientY: localBounds!.y + localBounds!.height / 2,
  });
  const leftPreview = await localTarget.locator(".editor-dock-drop-preview").evaluate((preview) => {
    const target = preview.parentElement!.getBoundingClientRect();
    const bounds = preview.getBoundingClientRect();
    const pattern = getComputedStyle(preview, "::after");
    return {
      width: bounds.width,
      height: bounds.height,
      targetHeight: target.height,
      patterned: pattern.maskImage !== "none" || pattern.webkitMaskImage !== "none",
    };
  });
  expect(leftPreview.width).toBe(20);
  expect(leftPreview.height).toBeCloseTo(leftPreview.targetHeight, 0);
  expect(leftPreview.patterned).toBe(true);

  await localTarget.dispatchEvent("dragover", {
    dataTransfer: transfer,
    clientX: localBounds!.x + localBounds!.width / 2,
    clientY: localBounds!.y + localBounds!.height - 2,
  });
  await expect(localTarget).toHaveAttribute("data-dock-edge", "bottom");
  const bottomPreview = await localTarget.locator(".editor-dock-drop-preview").evaluate((preview) => {
    const target = preview.parentElement!.getBoundingClientRect();
    const bounds = preview.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height, targetWidth: target.width };
  });
  expect(bottomPreview.height).toBe(20);
  expect(bottomPreview.width).toBeCloseTo(bottomPreview.targetWidth, 0);

  const workspaceTarget = page.locator('[data-workspace-dock-edge="bottom"]');
  const hitArea = workspaceTarget.locator(".editor-dock-workspace-edge-target__hit-area");
  const hitBounds = await hitArea.boundingBox();
  expect(hitBounds).not.toBeNull();
  await hitArea.dispatchEvent("dragover", {
    dataTransfer: transfer,
    clientX: hitBounds!.x + hitBounds!.width / 2,
    clientY: hitBounds!.y + hitBounds!.height / 2,
  });
  await expect(workspaceTarget).toHaveAttribute("data-active", "true");
  const workspacePreview = await workspaceTarget
    .locator(".editor-dock-workspace-edge-target__preview")
    .evaluate((preview) => {
      const workspace = preview.parentElement!.getBoundingClientRect();
      const bounds = preview.getBoundingClientRect();
      const pattern = getComputedStyle(preview, "::after");
      return {
        width: bounds.width,
        height: bounds.height,
        workspaceWidth: workspace.width,
        patterned: pattern.maskImage !== "none" || pattern.webkitMaskImage !== "none",
      };
    });
  expect(workspacePreview.height).toBe(20);
  expect(workspacePreview.width).toBeCloseTo(workspacePreview.workspaceWidth, 0);
  expect(workspacePreview.patterned).toBe(true);

  await hitArea.dispatchEvent("drop", { dataTransfer: transfer });
  const geometry = await page.locator('#editor-dock-surface-project').evaluate((surface) => {
    const pane = surface.getBoundingClientRect();
    const workspace = surface.closest(".editor-dock-workspace")!.getBoundingClientRect();
    const footer = document.querySelector('[aria-label="Editor status"]')!.getBoundingClientRect();
    return {
      left: pane.left - workspace.left,
      right: workspace.right - pane.right,
      bottom: workspace.bottom - pane.bottom,
      share: pane.height / workspace.height,
      footerGap: footer.top - workspace.bottom,
    };
  });
  expect(Math.abs(geometry.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.right)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.bottom)).toBeLessThanOrEqual(1);
  expect(geometry.share).toBeCloseTo(0.28, 2);
  expect(Math.abs(geometry.footerGap)).toBeLessThanOrEqual(1);
});
