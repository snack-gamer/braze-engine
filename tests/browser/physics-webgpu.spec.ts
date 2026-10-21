import { expect, test } from "playwright/test";
import type { PhysicsWebGpuFixtureResult } from "./fixtures/webgpu";

test("Impulse free fall and box contacts run without WebGPU validation errors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/tests/browser/fixtures/webgpu.html");
  await page.waitForFunction(() => Boolean(window.__physicsWebGpuFixture));
  const result = await page.evaluate(() => window.__physicsWebGpuFixture) as PhysicsWebGpuFixtureResult;
  test.skip(result.status === "unsupported", result.error ?? "WebGPU is unavailable in this browser.");

  expect(result.error).toBeUndefined();
  expect(result.status).toBe("passed");
  expect(result.validationErrors).toEqual([]);
  expect(result.uncapturedErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  const fall = result.freeFall!;
  expect(fall.every(Number.isFinite)).toBe(true);
  expect(fall[1]).toBeCloseTo(3.7396, 2); // semi-implicit gravity, 120 substeps at 1/240 s
  expect(fall[0]).toBeGreaterThan(0.2);
  expect(fall[5]).toBeCloseTo(5, 5); // gravity disabled
  expect(fall[9]).toBeGreaterThan(fall[1]); // linear damping reduces falling speed
  const settled = result.settled!;
  expect(settled.every(Number.isFinite)).toBe(true);
  expect(settled[1]).toBeCloseTo(-0.5, 5);
  expect(settled[5]).toBeCloseTo(0.5, 1);
  for (const [index, height] of [[2, 0.5], [3, 1.5], [4, 2.5]]) {
    expect(settled[index * 4 + 1]).toBeCloseTo(height, 1);
  }
  expect(settled[21]).toBeGreaterThan(0.4);
  expect(settled[21]).toBeLessThan(0.9);
  for (let index = 0; index < settled.length; index++) {
    expect(Math.abs(result.later![index] - settled[index])).toBeLessThan(0.05);
  }
});

test("editor transport preserves Play, Pause, Step, and Stop semantics", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.route("**/api/**", async (route) => {
    const method = route.request().method();
    if (method === "GET" || method === "HEAD") await route.continue();
    else await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/");
  await expect(page.getByLabel("3D scene viewport")).toBeVisible();
  const transformTools = page.getByRole("toolbar", { name: "Scene transform tools", exact: true });
  const moveTool = transformTools.getByRole("button", { name: "Move tool", exact: true });
  const rotateTool = transformTools.getByRole("button", { name: "Rotate tool", exact: true });
  const scaleTool = transformTools.getByRole("button", { name: "Scale tool", exact: true });
  await expect(moveTool).toHaveAttribute("aria-pressed", "true");
  await rotateTool.click();
  await expect(rotateTool).toHaveAttribute("aria-pressed", "true");

  const transformSettings = page.getByRole("toolbar", { name: "Scene view settings", exact: true });
  const transformSpace = transformSettings.getByRole("button", { name: "Transform handle space: Global" });
  await transformSpace.click();
  await expect(transformSettings.getByRole("button", { name: "Transform handle space: Local" })).toBeVisible();
  await transformSettings.getByRole("button", { name: "Transform handle space: Local" }).click();
  const transformSnapping = transformSettings.getByRole("button", { name: "Transform snapping", exact: true });
  await expect(transformSnapping).toContainText("15°");
  await transformSnapping.click();
  await expect(transformSnapping).toHaveAttribute("aria-pressed", "true");
  await transformSettings.getByRole("button", { name: "Transform snap settings", exact: true }).click();
  const snapMenu = page.getByRole("dialog", { name: "Transform snap settings", exact: true });
  await expect(snapMenu).toBeVisible();
  const rotationSnap = snapMenu.getByRole("spinbutton", { name: "Rotation snap increment", exact: true });
  await rotationSnap.fill("30");
  await expect(transformSnapping).toContainText("30°");
  await rotationSnap.fill("15");
  await transformSettings.getByRole("button", { name: "Transform snap settings", exact: true }).click();
  await transformSnapping.click();
  await scaleTool.click();
  await expect(scaleTool).toHaveAttribute("aria-pressed", "true");
  await moveTool.click();
  await transformTools.getByRole("button", { name: "Frame selected object", exact: true }).click();

  const sceneOrientation = page.getByRole("region", { name: "Scene orientation", exact: true });
  await expect(sceneOrientation).toBeVisible();
  const topView = sceneOrientation.getByRole("button", { name: "Top view (+Y)", exact: true });
  // The active axis projects behind the center projection cube by design. If
  // the persisted editor camera already is Top, there is nothing to snap.
  if (await topView.getAttribute("aria-pressed") !== "true") await topView.click({ timeout: 5_000 });
  await expect(topView).toHaveAttribute("aria-pressed", "true", { timeout: 3_000 });
  await expect(sceneOrientation).toHaveAttribute("data-active-view", "+y");
  const projectionToggle = sceneOrientation.locator("[data-projection-toggle]");
  await expect(projectionToggle).toHaveAccessibleName("Switch to orthographic projection", { exact: true });
  await projectionToggle.click();
  await page.waitForFunction(() => {
    const value = Number(document.querySelector<HTMLElement>('[aria-label="Scene orientation"]')?.dataset.projectionMix);
    return value > 0 && value < 1;
  });
  await expect(sceneOrientation).toHaveAttribute("data-projection", "orthographic");
  await expect(sceneOrientation).toHaveAttribute("data-projection-mix", "1.000");
  await expect(projectionToggle).toHaveAttribute("aria-pressed", "true");
  await sceneOrientation.getByRole("button", { name: "Switch to perspective projection", exact: true }).click();
  await expect(sceneOrientation).toHaveAttribute("data-projection-mix", "0.000");
  await expect(page.getByRole("region", { name: "Viewport statistics", exact: true })).toHaveCount(0);
  const sceneChromeLayout = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('[aria-label="3D scene viewport"]')!.getBoundingClientRect();
    const orientationElement = document.querySelector<HTMLElement>('[aria-label="Scene orientation"]')!;
    const orientation = orientationElement.getBoundingClientRect();
    const sceneSettings = document.querySelector<HTMLElement>('[aria-label="Scene view settings"]')!.getBoundingClientRect();
    const toolRail = document.querySelector<HTMLElement>('[aria-label="Scene transform tools"]')!.getBoundingClientRect();
    const overlaps = (first: DOMRect, second: DOMRect) => (
      first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
    );
    return {
      settingsAboveViewport: sceneSettings.bottom <= viewport.top + 1,
      orientationInsideViewport: orientation.top >= viewport.top && orientation.right <= viewport.right,
      toolRailInsideViewport: toolRail.top >= viewport.top && toolRail.left >= viewport.left,
      toolsOverlapOrientation: overlaps(toolRail, orientation),
      orientationBackground: getComputedStyle(orientationElement).backgroundColor,
    };
  });
  expect(sceneChromeLayout.settingsAboveViewport).toBe(true);
  expect(sceneChromeLayout.orientationInsideViewport).toBe(true);
  expect(sceneChromeLayout.toolRailInsideViewport).toBe(true);
  expect(sceneChromeLayout.toolsOverlapOrientation).toBe(false);
  expect(sceneChromeLayout.orientationBackground).toBe("rgba(0, 0, 0, 0)");
  const gizmosTrigger = page.getByRole("button", { name: "Gizmos", exact: true });
  await gizmosTrigger.click();
  const gizmosMenu = page.getByRole("dialog", { name: "Gizmo and grid settings", exact: true });
  await expect(gizmosMenu).toBeVisible();
  const showGrid = gizmosMenu.getByRole("checkbox", { name: "Show grid", exact: true });
  const showHandles = gizmosMenu.getByRole("checkbox", { name: "Show scene handles", exact: true });
  const showLabels = gizmosMenu.getByRole("checkbox", { name: "Object labels", exact: true });
  const showCameraGuides = gizmosMenu.getByRole("checkbox", { name: "Camera guides", exact: true });
  await expect(showGrid).toBeChecked();
  await expect(showHandles).toBeChecked();
  await expect(showLabels).not.toBeChecked();
  await expect(showCameraGuides).toBeChecked();
  await showGrid.uncheck();
  await expect(showGrid).not.toBeChecked();
  await showGrid.check();
  await expect(showGrid).toBeChecked();
  const gridOpacity = gizmosMenu.getByRole("slider", { name: "Grid opacity", exact: true });
  await gridOpacity.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "0.1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(gridOpacity).toHaveValue("0.1");
  await showHandles.uncheck();
  await expect(showHandles).not.toBeChecked();
  await showHandles.check();
  await expect(showHandles).toBeChecked();
  await showLabels.check();
  await expect(showLabels).toBeChecked();
  await showLabels.uncheck();
  await expect(showLabels).not.toBeChecked();
  await showCameraGuides.uncheck();
  await expect(showCameraGuides).not.toBeChecked();
  await showCameraGuides.check();
  const gizmoSize = gizmosMenu.getByRole("slider", { name: "Transform gizmo size", exact: true });
  await gizmoSize.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "0.9";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(gizmoSize).toHaveValue("0.9");
  await gizmoSize.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "0.7";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await gizmosTrigger.click();
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  const viewportStats = page.getByRole("region", { name: "Viewport statistics", exact: true });
  await expect(viewportStats).toBeVisible();
  await expect(viewportStats.getByText("RAF opportunity", { exact: true })).toBeVisible();
  await expect(viewportStats.getByText("Device work", { exact: true })).toBeVisible();
  await expect(viewportStats.getByText("Queue retired", { exact: true })).toBeVisible();
  await expect(viewportStats.getByText("GPU render window", { exact: true })).toBeVisible();
  await expect(viewportStats.getByText("JS heap", { exact: true })).toBeVisible();
  await expect(viewportStats.getByText("GPU memory", { exact: true })).toBeVisible();
  await expect(viewportStats.getByText("Meshes", { exact: true })).toBeVisible();
  await expect(viewportStats.getByText("Verts", { exact: true })).toBeVisible();
  await expect(viewportStats.locator('[data-viewport-stat="rafValue"]'))
    .toHaveAttribute("data-availability", /available|unavailable/, { timeout: 10_000 });
  await expect(page.locator('[data-pane-id="game"] .scene-tool-rail')).toHaveCount(0);
  await expect(page.locator('[data-pane-id="game"] .scene-label-layer > *')).toHaveCount(0);
  const statsToggle = viewportStats.getByRole("button", { name: "Toggle viewport statistics" });
  await statsToggle.click();
  await expect(statsToggle).toHaveAttribute("aria-expanded", "false");
  await statsToggle.click();
  await expect(statsToggle).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("tab", { name: "Scene", exact: true }).click();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()))
    .toBe("#477fb8");
  const surfaceHierarchy = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const color = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      return element ? getComputedStyle(element).backgroundColor : null;
    };
    const brightness = (value: string | null) => {
      const channels = value?.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
      return channels.length === 3 ? channels.reduce((total, channel) => total + channel, 0) : -1;
    };
    const inspectorWindow = color(".rail-right");
    const inspectorCard = color(".rail-right .inspector-section");
    const inspectorHead = color(".rail-right .inspector-section__head");
    return {
      tokens: [
        "--layer-well",
        "--layer-window",
        "--layer-component",
        "--layer-component-head",
        "--layer-raised",
      ].map((token) => style.getPropertyValue(token).trim()),
      inspectorWindow,
      inspectorCard,
      inspectorHead,
      inspectorWindowBrightness: brightness(inspectorWindow),
      inspectorCardBrightness: brightness(inspectorCard),
      inspectorHeadBrightness: brightness(inspectorHead),
      hierarchyWell: color(".object-list"),
    };
  });
  expect(surfaceHierarchy.tokens).toEqual(["#191a1d", "#222326", "#27282c", "#303136", "#383a40"]);
  expect(surfaceHierarchy.inspectorCard).toBe("rgba(0, 0, 0, 0)");
  expect(surfaceHierarchy.inspectorHeadBrightness).toBeGreaterThan(surfaceHierarchy.inspectorWindowBrightness);
  expect(surfaceHierarchy.hierarchyWell).toBe(surfaceHierarchy.inspectorWindow);
  const physicsSettings = page.getByRole("button", { name: "Physics settings", exact: true });
  await physicsSettings.click();
  const physicsInspector = page.getByRole("heading", { name: "Physics Settings" });
  await expect(physicsInspector).toBeVisible();
  const gravityInput = page.getByRole("spinbutton", { name: "Physics gravity Y" });
  const authoredGravity = await gravityInput.inputValue();
  await physicsSettings.click();
  await expect(physicsInspector).toBeHidden();
  const renderSettings = page.getByRole("button", { name: "Render settings", exact: true });
  await renderSettings.click();
  await expect(page.getByText("Render Settings", { exact: true }).first()).toBeVisible();
  await expect(renderSettings).toHaveAttribute("aria-pressed", "true");
  await renderSettings.click();
  const play = page.getByLabel("Enter Play Mode");
  await expect(play).toBeEnabled();
  await play.click();
  await expect(page.getByLabel("Exit Play Mode")).toHaveAttribute("aria-pressed", "true");
  await expect(moveTool).toBeDisabled();
  await page.getByLabel("Pause", { exact: true }).click();
  await expect(page.getByLabel("Resume", { exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Step one frame").click();
  await expect(page.getByLabel("Exit Play Mode")).toHaveAttribute("aria-pressed", "true");
  await physicsSettings.click();
  await gravityInput.fill("-3");
  await gravityInput.blur();
  await expect(gravityInput).toHaveValue("-3.000");
  await page.getByLabel("Exit Play Mode").click();
  await expect(page.getByLabel("Enter Play Mode")).toHaveAttribute("aria-pressed", "false");
  await expect(moveTool).toBeEnabled();
  await expect(gravityInput).toHaveValue(authoredGravity);
  expect(runtimeErrors).toEqual([]);
});
