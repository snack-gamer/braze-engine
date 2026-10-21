import { expect, test } from "playwright/test";
import { installCharacterFixture } from "./fixtures/character-authoring";

test("creates, opens, authors, and persists a nested Animator state machine", async ({ page }) => {
  const fixture = await installCharacterFixture(page);
  await page.goto("/");

  const inspector = page.locator(".rail-right");
  await inspector.getByRole("button", { name: "Add Component", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Add Component", exact: true });
  await palette.getByRole("searchbox", { name: "Search palette", exact: true }).fill("Animator");
  await palette.getByRole("button", { name: "Animator Controller", exact: true }).click();
  await inspector.getByRole("button", { name: "Create Empty", exact: true }).click();
  await inspector.locator(".animator-controller-edit-button").click();

  const editor = page.locator("#editor-dock-surface-animator");
  const viewport = editor.locator(".animator-graph-viewport");
  const viewportBounds = await viewport.boundingBox();
  expect(viewportBounds).not.toBeNull();
  await page.mouse.click(
    viewportBounds!.x + viewportBounds!.width * 0.55,
    viewportBounds!.y + viewportBounds!.height * 0.42,
    { button: "right" },
  );

  const createMenu = page.getByRole("menu", { name: "Create Animator node", exact: true });
  await expect(createMenu.getByRole("menuitem")).toHaveCount(3);
  for (const name of [
    "Create Nested State Machine",
    "Create 1D Blend Tree",
    "Create 2D Blend Tree",
  ]) {
    await expect(createMenu.getByRole("menuitem", { name, exact: true })).toBeVisible();
  }
  await expect(createMenu.getByRole("menuitem", { name: "Create 1D Blend Tree" })).toBeEnabled();
  await expect(createMenu.getByRole("menuitem", { name: "Create 2D Blend Tree" })).toBeEnabled();
  await createMenu.getByRole("menuitem", { name: "Create Nested State Machine" }).click();

  const machine = editor.locator('.animator-graph-node[data-kind="stateMachine"]');
  await expect(machine).toHaveCount(1);
  await expect(machine).toHaveAttribute("data-selected", "true");
  const machineName = editor.getByLabel("State machine name", { exact: true });
  await machineName.fill("Combo");
  await machineName.press("Enter");
  await expect(machine).toContainText("Combo");

  await machine.dblclick();
  await expect(viewport).toHaveAttribute("data-state-machine-id", /.+/);
  const breadcrumbs = editor.getByRole("navigation", {
    name: "Animator state machine path",
    exact: true,
  });
  await expect(breadcrumbs.getByRole("button")).toHaveText(["Base Layer", "Combo"]);
  await expect(breadcrumbs.getByRole("button", { name: "Combo", exact: true }))
    .toHaveAttribute("aria-current", "page");
  await expect(editor.getByRole("button", { name: "Open State Machine", exact: true }))
    .toHaveCount(0);

  await viewport.focus();
  await viewport.press("Shift+F10");
  await expect(createMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(createMenu).toBeHidden();
  await expect(viewport).toBeFocused();
  await viewport.press("Shift+F10");
  await expect(createMenu).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(createMenu).toBeHidden();
  await expect(viewport).not.toBeFocused();

  await page.getByRole("tab", { name: "Project", exact: true }).click();
  const project = page.locator("#editor-dock-surface-project");
  const clip = project.locator('.model-subasset-tile[data-local-id="clip:idle"]');
  if (!await clip.isVisible()) {
    await project.getByRole("button", {
      name: "Expand imported contents of Hero Character",
      exact: true,
    }).click();
  }
  const dragData = await clip.evaluate((element) => {
    const dataTransfer = new DataTransfer();
    element.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
    return Array.from(dataTransfer.types, (type) => [type, dataTransfer.getData(type)] as const);
  });
  await page.getByRole("tab", { name: "Behavior Map", exact: true }).click();
  await viewport.evaluate((element, data) => {
    const bounds = element.getBoundingClientRect();
    const dataTransfer = new DataTransfer();
    for (const [type, value] of data) dataTransfer.setData(type, value);
    const eventInit = {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width * 0.58,
      clientY: bounds.top + bounds.height * 0.46,
      dataTransfer,
    };
    element.dispatchEvent(new DragEvent("dragover", eventInit));
    element.dispatchEvent(new DragEvent("drop", eventInit));
  }, dragData);

  const state = editor.locator('.animator-graph-node[data-kind="state"]');
  const exit = editor.locator('.animator-graph-node[data-kind="exit"]');
  await expect(state).toHaveCount(1);
  await editor.getByRole("button", { name: "Connect Entry", exact: true }).click();
  const connectionMode = editor.locator(".animator-connection-mode");
  await viewport.focus();
  await viewport.press("Shift+F10");
  await expect(connectionMode).toBeHidden();
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Connect Entry", exact: true }).click();
  await connectionMode.dispatchEvent("contextmenu", { bubbles: true, cancelable: true });
  await expect(createMenu).toBeHidden();
  await state.getByRole("button", { name: "Connect to Idle", exact: true }).click();
  await state.getByRole("button", { name: "Create transition from Idle", exact: true }).click();
  await exit.getByRole("button", { name: "Connect to Exit", exact: true }).click();
  const transitionEdge = editor.locator('.animator-graph-edge[data-kind="transition"]');
  await expect(transitionEdge).toHaveCount(1);
  await transitionEdge.dispatchEvent("contextmenu", { bubbles: true, cancelable: true });
  await expect(createMenu).toBeHidden();

  await expect.poll(() => {
    const animator = fixture.sceneObject()?.animator as {
      controller?: { layers?: Array<{ stateMachines?: Array<{
        name?: string;
        defaultStateId?: string;
        states?: Array<{ id?: string; transitions?: Array<{ destination?: { kind?: string } }> }>;
      }> }> };
    } | undefined;
    const nested = animator?.controller?.layers?.[0]?.stateMachines?.[0];
    return {
      name: nested?.name,
      entryMatchesState: nested?.defaultStateId === nested?.states?.[0]?.id,
      destination: nested?.states?.[0]?.transitions?.[0]?.destination?.kind,
    };
  }).toEqual({ name: "Combo", entryMatchesState: true, destination: "exit" });

  await breadcrumbs.getByRole("button", { name: "Base Layer", exact: true }).click();
  await expect(viewport).not.toHaveAttribute("data-state-machine-id", /.+/);
  await expect(machine).toContainText("Combo");
  await expect.poll(() => fixture.sceneWrites()).toBeGreaterThan(0);

  await page.reload();
  await inspector.locator(".animator-controller-edit-button").click();
  await expect(editor.locator('.animator-graph-node[data-kind="stateMachine"]')).toContainText("Combo");
});

test("creates a 2D Blend Tree and its missing Float parameters", async ({ page }) => {
  const fixture = await installCharacterFixture(page);
  await page.goto("/");

  const inspector = page.locator(".rail-right");
  await inspector.getByRole("button", { name: "Add Component", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Add Component", exact: true });
  await palette.getByRole("searchbox", { name: "Search palette", exact: true }).fill("Animator");
  await palette.getByRole("button", { name: "Animator Controller", exact: true }).click();
  await inspector.getByRole("button", { name: "Create Empty", exact: true }).click();
  await inspector.locator(".animator-controller-edit-button").click();

  const editor = page.locator("#editor-dock-surface-animator");
  const viewport = editor.locator(".animator-graph-viewport");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(
    bounds!.x + bounds!.width * 0.55,
    bounds!.y + bounds!.height * 0.42,
    { button: "right" },
  );
  const menu = page.getByRole("menu", { name: "Create Animator node", exact: true });
  await expect(menu.getByRole("menuitem", { name: "Create 2D Blend Tree" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "Create 2D Blend Tree" }).click();

  const state = editor.locator('.animator-graph-node[data-motion-kind="blendTree2d"]');
  await expect(state).toContainText("New Blend Tree");
  await expect(state).toContainText("Blend Tree");
  await expect(state).toContainText("2D");
  await expect(state.locator(".animator-graph-node__blend-icon")).toHaveCount(1);
  const contextInspector = editor.getByRole("complementary", {
    name: "Animator context inspector",
    exact: true,
  });
  await expect(contextInspector.getByText("Blend Tree", { exact: true })).toBeVisible();
  const blendType = contextInspector.getByRole("combobox", { name: "Blend type", exact: true });
  await expect(blendType).toHaveValue("2dFreeformCartesian");
  await expect(blendType.locator("option")).toHaveText([
    "1D Blend Tree",
    "2D Simple Directional",
    "2D Freeform Directional",
    "2D Freeform Cartesian",
    "Direct Blend Tree",
  ]);
  await expect(contextInspector.getByText("Playback", { exact: true })).toHaveCount(0);
  await expect(contextInspector.getByRole("button", { name: "Add Child", exact: true })).toHaveCount(0);
  await expect(contextInspector.getByRole("combobox", { name: "X Parameter", exact: true }))
    .toHaveValue(/.+/);
  await expect(contextInspector.getByRole("combobox", { name: "Y Parameter", exact: true }))
    .toHaveValue(/.+/);

  await state.dblclick();
  const blendCanvas = editor.getByLabel("Blend Tree canvas", { exact: true });
  await expect(blendCanvas).toBeVisible();
  await expect(blendCanvas.locator(".animator-graph-grid")).toHaveCount(1);
  await expect(blendCanvas.locator(".animator-graph-edge__line")).toHaveCount(0);
  await expect(blendCanvas.locator('[data-node-id="root"]')).toContainText("New Blend Tree");
  await expect(blendCanvas.getByText(
    "Empty Blend Tree — drag Animation Clips here.",
    { exact: true },
  )).toBeVisible();
  await expect(editor.getByRole("navigation", { name: "Animator state machine path", exact: true })
    .getByRole("button")).toHaveText(["Base Layer", "New Blend Tree"]);
  await editor.getByRole("button", { name: "Base Layer", exact: true }).click();
  await expect(state).toBeVisible();

  await expect.poll(() => {
    const animator = fixture.sceneObject()?.animator as {
      controller?: {
        parameters?: Array<{ id?: string; name?: string; kind?: string }>;
        layers?: Array<{
          states?: Array<{
            motion?: {
              tree?: {
                kind?: string;
                parameterXId?: string;
                parameterYId?: string;
              };
            };
          }>;
        }>;
      };
    } | undefined;
    const controller = animator?.controller;
    const namesById = new Map(controller?.parameters?.map((parameter) => [
      parameter.id,
      parameter.name,
    ]) ?? []);
    const tree = controller?.layers?.[0]?.states?.[0]?.motion?.tree;
    return {
      kind: tree?.kind,
      x: namesById.get(tree?.parameterXId),
      y: namesById.get(tree?.parameterYId),
    };
  }).toEqual({ kind: "2dFreeformCartesian", x: "Blend X", y: "Blend Y" });
});

test("explains an incomplete 1D Blend Tree and previews its clip weights", async ({ page }) => {
  await installCharacterFixture(page, { distinctAnimationClips: true });
  await page.goto("/");

  const inspector = page.locator(".rail-right");
  await inspector.getByRole("button", { name: "Add Component", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Add Component", exact: true });
  await palette.getByRole("searchbox", { name: "Search palette", exact: true }).fill("Animator");
  await palette.getByRole("button", { name: "Animator Controller", exact: true }).click();
  await inspector.getByRole("button", { name: "Create Empty", exact: true }).click();
  await inspector.locator(".animator-controller-edit-button").click();

  const editor = page.locator("#editor-dock-surface-animator");
  await editor.getByRole("button", { name: "Add parameter", exact: true }).click();
  await editor.getByRole("menu", { name: "Parameter types", exact: true })
    .getByRole("menuitem", { name: "Float", exact: true }).click();
  const parameterName = editor.getByLabel("Parameter name", { exact: true });
  await parameterName.fill("Speed");
  await parameterName.press("Enter");

  const viewport = editor.locator(".animator-graph-viewport");
  const viewportBounds = await viewport.boundingBox();
  expect(viewportBounds).not.toBeNull();
  await page.mouse.click(
    viewportBounds!.x + viewportBounds!.width * 0.55,
    viewportBounds!.y + viewportBounds!.height * 0.42,
    { button: "right" },
  );
  await page.getByRole("menu", { name: "Create Animator node", exact: true })
    .getByRole("menuitem", { name: "Create 1D Blend Tree", exact: true }).click();

  const context = editor.locator(".animator-workspace__body > .animator-workspace__inspector");
  await expect(context.getByText("Motions & Thresholds", { exact: true })).toBeVisible();
  const blendType = context.getByRole("combobox", { name: "Blend type", exact: true });
  await expect(blendType.locator('option[value="2dFreeformCartesian"]')).toBeEnabled();
  await blendType.selectOption("2dFreeformCartesian");
  await expect(context.getByText("2D Motion Space", { exact: true })).toBeVisible();
  await blendType.selectOption("1d");
  await expect(context.getByText("No motions to blend", { exact: true })).toBeVisible();
  const emptyPreview = context.getByRole("slider", { name: "Speed blend preview", exact: true });
  await expect(emptyPreview).toBeVisible();
  await expect(emptyPreview.locator(".animator-motion-space__playhead")).toHaveCount(1);
  await expect(context.getByRole("button", { name: "Add Child", exact: true })).toHaveCount(0);

  const blendNode = editor.locator('.animator-graph-node[data-motion-kind="blendTree1d"]');
  await expect(blendNode).toContainText("Blend Tree");
  await expect(blendNode).toContainText("1D");
  await expect(blendNode.locator(".animator-graph-node__blend-icon")).toHaveCount(1);
  await expect(editor.getByText(/configuration issue/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Open Console", exact: true }).click();
  const consoleWindow = page.getByLabel("Editor Console", { exact: true });
  const emptyTreeIssue = consoleWindow.locator(".console-window__row").filter({
    hasText: "Blend Tree “New Blend Tree” has no child motions. Add at least one Animation Clip.",
  });
  await expect(emptyTreeIssue).toBeVisible();
  await emptyTreeIssue.click();
  await expect(consoleWindow.getByLabel("Selected Console message", { exact: true }))
    .toContainText("empty-blend-tree");

  await page.getByRole("tab", { name: "Project", exact: true }).click();
  const project = page.locator("#editor-dock-surface-project");
  const clip = project.locator('.model-subasset-tile[data-local-id="clip:idle"]');
  if (!await clip.isVisible()) {
    await project.getByRole("button", { name: "Expand imported contents of Hero Character", exact: true }).click();
  }
  const dragData = await clip.evaluate((element) => {
    const dataTransfer = new DataTransfer();
    element.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
    return Array.from(dataTransfer.types, (type) => [type, dataTransfer.getData(type)] as const);
  });
  const secondDragData = await project.locator('.model-subasset-tile[data-local-id="clip:lean"]')
    .evaluate((element) => {
      const dataTransfer = new DataTransfer();
      element.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
      return Array.from(dataTransfer.types, (type) => [type, dataTransfer.getData(type)] as const);
    });
  await page.getByRole("tab", { name: "Behavior Map", exact: true }).click();

  await blendNode.dblclick();
  const blendCanvas = editor.getByLabel("Blend Tree canvas", { exact: true });
  const blendViewport = blendCanvas.locator(".animator-graph-viewport");
  const motionNodes = blendCanvas.locator('.animator-graph-node:not([data-node-id="root"])');
  await expect(motionNodes).toHaveCount(0);
  await expect(blendCanvas.getByText("Empty Blend Tree — drag Animation Clips here.", { exact: true })).toBeVisible();
  const blendWorld = blendCanvas.locator(".animator-graph-world");
  const blendBounds = await blendViewport.boundingBox();
  expect(blendBounds).not.toBeNull();
  const initialTransform = await blendWorld.evaluate((element) => getComputedStyle(element).transform);
  await page.mouse.move(blendBounds!.x + 160, blendBounds!.y + 140);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(blendBounds!.x + 215, blendBounds!.y + 175, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  await expect.poll(() => blendWorld.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(initialTransform);
  const isolatedMotions = blendViewport;
  await isolatedMotions.evaluate((element, entries) => {
    const dataTransfer = new DataTransfer();
    for (const [type, value] of entries) dataTransfer.setData(type, value);
    element.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  }, dragData);
  await expect(context.getByText(/plays at 100%/)).toBeVisible();
  await expect(motionNodes).toHaveCount(1);
  await expect(blendCanvas.locator(".animator-graph-edge__line")).toHaveCount(1);
  await expect(blendCanvas.getByText("Empty Blend Tree — drag Animation Clips here.", { exact: true })).toHaveCount(0);
  await isolatedMotions.evaluate((element, entries) => {
    const dataTransfer = new DataTransfer();
    for (const [type, value] of entries) dataTransfer.setData(type, value);
    element.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  }, secondDragData);
  await expect(motionNodes).toHaveCount(2);
  await expect(motionNodes.nth(0)).toContainText("clip:idle");
  await expect(motionNodes.nth(1)).toContainText("clip:lean");
  await expect(blendCanvas.locator(".animator-graph-edge__line")).toHaveCount(2);

  await motionNodes.first().click();
  await expect(motionNodes.first()).toHaveAttribute("data-selected", "true");
  await expect(context.getByRole("combobox", { name: "Animation clip", exact: true })).toBeVisible();
  await expect(context.getByRole("spinbutton", { name: "Blend child speed", exact: true })).toBeVisible();
  await expect(context.getByRole("spinbutton", { name: "Blend child threshold", exact: true })).toBeVisible();
  const clipSpeed = context.getByRole("spinbutton", { name: "Clip motion speed", exact: true });
  await expect(clipSpeed).toBeVisible();
  await clipSpeed.fill("1.25");
  await clipSpeed.press("Enter");
  await expect(clipSpeed).toHaveValue("1.25");
  const clipLoop = context.getByRole("combobox", { name: "Clip loop mode", exact: true });
  await expect(clipLoop).toHaveValue("source");
  await expect(clipLoop.locator('option[value="source"]')).toHaveText("Clip Default (Loop)");
  await clipLoop.selectOption("once");
  await expect(clipLoop).toHaveValue("once");

  const preview = context.getByRole("slider", { name: "Speed blend preview", exact: true });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("aria-valuemin", "0");
  await expect(preview).toHaveAttribute("aria-valuemax", "1");
  await expect(preview.locator(".animator-motion-space__playhead")).toHaveCount(1);
  await expect(preview.locator(".animator-motion-space__puck")).toHaveCount(0);
  const previewBounds = await preview.boundingBox();
  expect(previewBounds).not.toBeNull();
  const maximumWeightLabel = await preview.locator("text").filter({ hasText: "100%" }).boundingBox();
  expect(maximumWeightLabel).not.toBeNull();
  expect(maximumWeightLabel!.x).toBeGreaterThanOrEqual(previewBounds!.x);
  expect(maximumWeightLabel!.x + maximumWeightLabel!.width)
    .toBeLessThanOrEqual(previewBounds!.x + previewBounds!.width);
  await preview.click({ position: {
    x: previewBounds!.width * 152 / 274,
    y: previewBounds!.height / 2,
  } });
  await expect(preview).toHaveAttribute("aria-valuetext", /50%.*50%/);
  const blendEdges = blendCanvas.locator('.animator-graph-edge[data-kind="entry"]');
  const midpointOpacities = await blendEdges.evaluateAll((edges) => (
    edges.map((edge) => Number(getComputedStyle(edge).opacity))
  ));
  expect(midpointOpacities[0]).toBeCloseTo(midpointOpacities[1]!, 1);
  await preview.scrollIntoViewIfNeeded();
  const scrubBounds = await preview.boundingBox();
  expect(scrubBounds).not.toBeNull();
  await page.mouse.move(scrubBounds!.x + 24, scrubBounds!.y + 16);
  await page.mouse.down();
  await page.mouse.move(
    scrubBounds!.x + scrubBounds!.width - 8,
    scrubBounds!.y + 16,
    { steps: 8 },
  );
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");
  await expect(preview).toHaveCSS("user-select", "none");
  await expect.poll(async () => Number(await preview.getAttribute("aria-valuenow")))
    .toBe(1);

  await page.getByLabel("Enter Play Mode", { exact: true }).click();
  await expect(motionNodes.nth(0)).not.toHaveAttribute("data-active", "true");
  await expect(motionNodes.nth(1)).toHaveAttribute("data-active", "true");
  const endpointOpacities = await blendEdges.evaluateAll((edges) => (
    edges.map((edge) => Number(getComputedStyle(edge).opacity))
  ));
  expect(endpointOpacities[1]).toBeGreaterThan(endpointOpacities[0]! + 0.5);
  await page.getByLabel("Pause", { exact: true }).click();
  await editor.getByRole("navigation", { name: "Animator state machine path", exact: true })
    .getByRole("button", { name: "Base Layer", exact: true }).click();
  await editor.getByRole("button", { name: "Select Speed parameter", exact: true }).click();
  await expect(context.getByText("Paused", { exact: true })).toBeVisible();
  const liveSpeed = context.getByLabel("Current parameter value", { exact: true });
  await expect(liveSpeed).toHaveAttribute("min", "0");
  await expect(liveSpeed).toHaveAttribute("max", "1");
  await liveSpeed.fill("4");
  await liveSpeed.press("Enter");
  await expect(liveSpeed).toHaveValue("1.00");
  await liveSpeed.fill("-2");
  await liveSpeed.press("Enter");
  await expect(liveSpeed).toHaveValue("0.00");
  await liveSpeed.fill("0.5");
  await liveSpeed.press("Enter");
  await expect(liveSpeed).toHaveValue("0.50");
  await blendNode.dblclick();
  await expect(preview).toBeVisible();
  await expect(motionNodes.nth(0)).toHaveAttribute("data-active", "true");
  await expect(motionNodes.nth(1)).toHaveAttribute("data-active", "true");
  const childProgress = motionNodes.getByRole("progressbar");
  await expect(childProgress).toHaveCount(2);
  await expect.poll(async () => Number(await childProgress.first().getAttribute("aria-valuenow")))
    .toBeGreaterThan(0);
  await preview.click({ position: {
    x: scrubBounds!.width * 262 / 274,
    y: scrubBounds!.height / 2,
  } });
  await expect(motionNodes.nth(0)).not.toHaveAttribute("data-active", "true");
  await expect(motionNodes.nth(1)).toHaveAttribute("data-active", "true");
  await page.getByLabel("Exit Play Mode", { exact: true }).click();
  await expect(childProgress).toHaveCount(0);
});
