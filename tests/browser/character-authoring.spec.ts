import { expect, test } from "playwright/test";
import { installCharacterFixture } from "./fixtures/character-authoring";

test("routes imported character setup through the Model Inspector", async ({ page }) => {
  const fixture = await installCharacterFixture(page);
  await page.goto("/");

  const statusBar = page.getByRole("contentinfo", { name: "Editor status", exact: true });
  await expect(statusBar).toBeVisible();
  await expect(statusBar.getByLabel("Editor metrics", { exact: true })).toContainText("EDIT");
  await expect(statusBar.getByLabel("Editor metrics", { exact: true })).toContainText("WebGPU");
  const statusLayout = await statusBar.evaluate((footer) => {
    const workspace = document.querySelector(".editor-dock-workspace")!.getBoundingClientRect();
    const bounds = footer.getBoundingClientRect();
    return { height: bounds.height, gap: bounds.top - workspace.bottom };
  });
  expect(statusLayout.height).toBeGreaterThanOrEqual(24);
  expect(Math.abs(statusLayout.gap)).toBeLessThanOrEqual(1);

  await expect(page.getByRole("button", { name: "Character", exact: true })).toHaveCount(0);
  await page.locator(".model-tile").filter({ hasText: "Hero Character" }).click();

  const inspector = page.locator(".rail-right");
  await expect(inspector.getByRole("tab", { name: "Model", exact: true })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "Rig", exact: true })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "Animation", exact: true })).toBeVisible();
  await expect(inspector.getByRole("tab", { name: "Materials", exact: true })).toBeVisible();

  await inspector.getByRole("tab", { name: "Animation", exact: true }).click();
  await expect(inspector.getByRole("switch", { name: "Import Animation", exact: true })).toBeChecked();
  await expect(inspector.getByLabel("Compression", { exact: true })).toHaveValue("off");
  const loopIdle = inspector.getByRole("switch", { name: "Loop Time", exact: true });
  await expect(loopIdle).toBeChecked();
  await loopIdle.uncheck();
  await inspector.getByLabel("Compression", { exact: true }).selectOption("keyframeReduction");

  await inspector.getByRole("button", { name: "Apply & Reimport", exact: true }).click();
  await expect.poll(() => fixture.importWrites()).toBe(1);
  expect(fixture.importSettings()).toMatchObject({
    animationCompression: "keyframeReduction",
    clipSettings: {
      "clip:idle": {
        kind: "source",
        enabled: true,
        sourceIndex: 0,
        sourceTakeLocalId: "clip:idle",
        looping: false,
      },
    },
  });
});

test("persists Generic and Humanoid Rig controls through Apply & Reimport", async ({ page }) => {
  const fixture = await installCharacterFixture(page);
  await page.goto("/");
  await page.locator(".model-tile").filter({ hasText: "Hero Character" }).click();
  await page.getByRole("tab", { name: "Rig", exact: true }).click();

  const animationType = page.getByLabel("Animation Type", { exact: true });
  await animationType.selectOption("generic");
  await expect(page.getByRole("button", { name: "Configure Rig", exact: true })).toBeVisible();
  await expect(page.getByText("Rig configured", { exact: true })).toBeVisible();

  await animationType.selectOption("humanoid");
  await expect(page.getByLabel("Avatar Definition", { exact: true })).toHaveValue("createFromModel");
  const configureAvatar = page.getByRole("button", { name: "Configure Avatar", exact: true });
  await expect(configureAvatar).toBeVisible();
  await expect(configureAvatar).toHaveAttribute("aria-haspopup", "dialog");
  await expect(configureAvatar).toHaveAttribute("aria-expanded", "false");
  const configureSurface = await configureAvatar.evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      backgroundColor: style.backgroundColor,
      borderStyle: style.borderTopStyle,
      boxShadow: style.boxShadow,
      cursor: style.cursor,
      height: button.getBoundingClientRect().height,
    };
  });
  expect(configureSurface.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(configureSurface.borderStyle).toBe("solid");
  expect(configureSurface.boxShadow).toBe("none");
  expect(configureSurface.cursor).toBe("pointer");
  expect(configureSurface.height).toBeGreaterThanOrEqual(24);

  await configureAvatar.hover();
  await expect.poll(() => configureAvatar.evaluate((button) => getComputedStyle(button).backgroundColor))
    .not.toBe(configureSurface.backgroundColor);
  await page.getByLabel("Max Influences", { exact: true }).selectOption("2");
  await page.getByRole("switch", { name: "Import Blend Shapes", exact: true }).uncheck();

  const revert = page.getByRole("button", { name: "Revert", exact: true });
  await expect(revert).toBeEnabled();
  const neutralSurface = await revert.evaluate((button) => {
    const style = getComputedStyle(button);
    return { backgroundColor: style.backgroundColor, borderStyle: style.borderTopStyle, boxShadow: style.boxShadow };
  });
  expect(neutralSurface.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(neutralSurface.borderStyle).toBe("solid");
  expect(neutralSurface.boxShadow).toBe("none");

  await page.getByRole("button", { name: "Apply & Reimport", exact: true }).click();
  await expect.poll(() => fixture.importWrites()).toBe(1);
  expect(fixture.importSettings().rig).toMatchObject({
    kind: "humanoid",
    avatarSource: { kind: "createFromModel" },
    maxBoneInfluences: 2,
    importBlendShapes: false,
  });
  await expect(page.locator(".model-import__status")).toHaveText("No pending changes");
});

test("Configure Rig commits through one explicit Save & Reimport command", async ({ page }) => {
  const fixture = await installCharacterFixture(page);
  await page.goto("/");
  await page.locator(".model-tile").filter({ hasText: "Hero Character" }).click();
  await page.getByRole("button", {
    name: "Expand imported contents of Hero Character",
    exact: true,
  }).click();
  const avatarTile = page.locator('.model-subasset-tile[data-local-id="avatar:main"]')
    .filter({ hasText: "Hero Generic Avatar" });
  await expect(avatarTile).toContainText("Hero Generic Avatar");
  const identityBefore = await avatarTile.evaluate((element) => ({
    guid: element.getAttribute("data-asset-guid"),
    localId: element.getAttribute("data-local-id"),
  }));
  const assetReadsBefore = fixture.assetListReads();
  await page.getByRole("tab", { name: "Rig", exact: true }).click();
  await page.getByRole("button", { name: "Configure Rig", exact: true }).click();

  const configurator = page.getByRole("dialog", { name: "Rig Configuration", exact: true });
  const save = configurator.getByRole("button", { name: "Save & Reimport", exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(configurator).toHaveCount(0);
  await expect.poll(() => fixture.importWrites()).toBe(1);
  await expect.poll(() => fixture.assetListReads()).toBeGreaterThan(assetReadsBefore);
  await expect(avatarTile).toContainText("Hero Generic Avatar · Reimported");
  expect(await avatarTile.evaluate((element) => ({
    guid: element.getAttribute("data-asset-guid"),
    localId: element.getAttribute("data-local-id"),
  }))).toEqual(identityBefore);

  await page.reload();
  await page.locator(".model-tile").filter({ hasText: "Hero Character" }).click();
  await page.getByRole("tab", { name: "Rig", exact: true }).click();
  await expect(page.getByLabel("Animation Type", { exact: true })).toHaveValue("generic");
});

test("keeps Animator Controller out of Project/Create and persists reusable Avatar Masks", async ({ page }) => {
  const fixture = await installCharacterFixture(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Create or import into Assets", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Create", exact: true });
  await expect(create).toBeVisible();
  await expect(create.getByRole("button", { name: "Animator Controller", exact: true })).toHaveCount(0);
  await create.getByRole("button", { name: "Avatar Mask", exact: true }).click();

  const tile = page.locator(".character-asset-tile").filter({ hasText: "Avatar Mask 1" });
  await expect(tile).toBeVisible();
  await expect(tile).toHaveClass(/focused/);
  await expect(page.locator(".character-asset-dialog")).toHaveCount(0);

  await tile.dblclick();
  const editor = page.locator(".character-asset-dialog");
  await expect(editor).toBeVisible();
  await expect(editor.getByText("ANIMATION / AVATAR MASK", { exact: true })).toBeVisible();
  await expect(editor.getByText("Avatar Mask 1", { exact: true })).toBeVisible();
  expect(await editor.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe("rgba(0, 0, 0, 0)");
  await editor.getByRole("button", { name: "Close", exact: true }).click();

  await expect.poll(() => fixture.characterSectionWrites()).toBeGreaterThan(0);
  expect(fixture.mask()).toMatchObject({ name: "Avatar Mask 1" });
});

test("offers Animator while a ready model has no published character sub-assets", async ({ page }) => {
  await installCharacterFixture(page, { publishCharacterSubAssets: false });
  await page.goto("/");

  await page.locator(".rail-right").getByRole("button", { name: "Add Component", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Add Component", exact: true });
  await palette.getByRole("searchbox", { name: "Search palette", exact: true }).fill("Animator");
  await expect(palette.getByRole("button", { name: "Animator Controller", exact: true })).toBeEnabled();
});

test("uses left drag for Clip selection and middle drag for graph panning", async ({ page }) => {
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
  const nodes = editor.locator('.animator-graph-node[data-kind="state"]');
  await expect(nodes).toHaveCount(1);
  await editor.getByRole("button", { name: "Frame all nodes", exact: true }).click();
  const first = await nodes.nth(0).boundingBox();
  const viewport = await editor.locator(".animator-graph-viewport").boundingBox();
  expect(first).not.toBeNull();
  expect(viewport).not.toBeNull();

  const world = editor.locator(".animator-graph-world");
  const beforeMarquee = await world.getAttribute("style");
  await page.mouse.move(
    Math.max(viewport!.x + 3, first!.x - 8),
    Math.max(viewport!.y + 3, first!.y - 8),
  );
  await page.mouse.down();
  await page.mouse.move(
    Math.min(viewport!.x + viewport!.width - 3, first!.x + first!.width + 8),
    Math.min(viewport!.y + viewport!.height - 3, first!.y + first!.height + 8),
    { steps: 6 },
  );
  await page.mouse.up();
  await expect(nodes.nth(0)).toHaveAttribute("data-selected", "true");
  await expect(world).toHaveAttribute("style", beforeMarquee ?? "");

  await page.mouse.move(viewport!.x + 20, viewport!.y + 20);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(viewport!.x + 85, viewport!.y + 60, { steps: 5 });
  await page.mouse.up({ button: "middle" });
  await expect.poll(() => world.getAttribute("style")).not.toBe(beforeMarquee);

  const beforeContext = await world.getAttribute("style");
  await nodes.nth(0).click({ button: "right" });
  await expect(nodes.nth(0)).toHaveAttribute("data-selected", "true");
  await expect(world).toHaveAttribute("style", beforeContext ?? "");
});

test("drops, connects, and deletes imported Animation Clips without changing the hierarchy", async ({ page }) => {
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
  const graphViewport = editor.locator(".animator-graph-viewport");
  await expect(graphViewport).toBeVisible();

  await page.getByRole("tab", { name: "Project", exact: true }).click();
  const project = page.locator("#editor-dock-surface-project");
  const clip = project.locator('.model-subasset-tile[data-local-id="clip:idle"]');
  if (!await clip.isVisible()) {
    await project.getByRole("button", { name: "Expand imported contents of Hero Character", exact: true }).click();
  }
  await expect(clip).toBeVisible();
  await expect(clip).toHaveAttribute("draggable", "true");
  const dragData = await clip.evaluate((element) => {
    const dataTransfer = new DataTransfer();
    element.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
    return Array.from(dataTransfer.types, (type) => [type, dataTransfer.getData(type)] as const);
  });

  await page.getByRole("tab", { name: "Behavior Map", exact: true }).click();
  const viewportBounds = await graphViewport.boundingBox();
  expect(viewportBounds).not.toBeNull();
  const targetPosition = {
    x: Math.round(viewportBounds!.width * 0.62),
    y: Math.round(viewportBounds!.height * 0.46),
  };
  await graphViewport.evaluate((element, input) => {
    const bounds = element.getBoundingClientRect();
    const dataTransfer = new DataTransfer();
    for (const [type, value] of input.dragData) dataTransfer.setData(type, value);
    const eventInit = {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + input.targetPosition.x,
      clientY: bounds.top + input.targetPosition.y,
      dataTransfer,
    };
    element.dispatchEvent(new DragEvent("dragover", eventInit));
    element.dispatchEvent(new DragEvent("drop", eventInit));
  }, { dragData, targetPosition });

  const state = editor.locator('.animator-graph-node[data-kind="state"]');
  await expect(state).toHaveCount(1);
  await expect(state).toContainText("Idle");
  await expect(state).toHaveAttribute("data-selected", "true");
  await expect(editor.locator(".animator-graph-edge")).toHaveCount(0);
  const stateBounds = await state.boundingBox();
  expect(stateBounds).not.toBeNull();
  expect(stateBounds!.x + stateBounds!.width / 2)
    .toBeCloseTo(viewportBounds!.x + targetPosition.x, 0);
  expect(stateBounds!.y + stateBounds!.height / 2)
    .toBeCloseTo(viewportBounds!.y + targetPosition.y, 0);
  await expect.poll(() => {
    const animator = fixture.sceneObject()?.animator as {
      controller?: { layers?: Array<{
        defaultStateId?: string;
        states?: Array<{ transitions?: unknown[] }>;
        anyStateTransitions?: unknown[];
      }> };
    } | undefined;
    const layer = animator?.controller?.layers?.[0];
    return {
      defaultStateId: layer?.defaultStateId,
      stateCount: layer?.states?.length,
      stateTransitions: layer?.states?.[0]?.transitions?.length,
      anyStateTransitions: layer?.anyStateTransitions?.length,
    };
  }).toEqual({ defaultStateId: "", stateCount: 1, stateTransitions: 0, anyStateTransitions: 0 });

  await editor.getByRole("button", { name: "Connect Entry", exact: true }).click();
  await state.getByRole("button", { name: "Connect to Idle", exact: true }).click();
  await expect(editor.locator('.animator-graph-edge[data-kind="entry"]')).toHaveCount(1);
  await expect(editor.locator('.animator-graph-edge[data-kind="transition"]')).toHaveCount(0);
  await expect.poll(() => {
    const animator = fixture.sceneObject()?.animator as {
      controller?: { layers?: Array<{
        defaultStateId?: string;
        states?: Array<{ id?: string; transitions?: unknown[] }>;
      }> };
    } | undefined;
    const layer = animator?.controller?.layers?.[0];
    return {
      entryMatchesState: layer?.defaultStateId === layer?.states?.[0]?.id,
      stateTransitions: layer?.states?.[0]?.transitions?.length,
    };
  }).toEqual({ entryMatchesState: true, stateTransitions: 0 });

  const secondTargetPosition = {
    x: Math.min(viewportBounds!.width - 100, targetPosition.x + 260),
    y: Math.min(viewportBounds!.height - 60, targetPosition.y + 110),
  };
  await graphViewport.evaluate((element, input) => {
    const bounds = element.getBoundingClientRect();
    const dataTransfer = new DataTransfer();
    for (const [type, value] of input.dragData) dataTransfer.setData(type, value);
    const eventInit = {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + input.targetPosition.x,
      clientY: bounds.top + input.targetPosition.y,
      dataTransfer,
    };
    element.dispatchEvent(new DragEvent("dragover", eventInit));
    element.dispatchEvent(new DragEvent("drop", eventInit));
  }, { dragData, targetPosition: secondTargetPosition });

  await expect(state).toHaveCount(2);
  await expect(state.nth(1)).toContainText("Idle 2");
  await expect(editor.locator('.animator-graph-edge[data-kind="transition"]')).toHaveCount(0);
  await editor.getByRole("button", { name: "Frame all nodes", exact: true }).click();
  await editor.getByRole("button", { name: "Zoom in", exact: true }).click();
  const pannedViewport = await graphViewport.boundingBox();
  expect(pannedViewport).not.toBeNull();
  await page.mouse.move(
    pannedViewport!.x + pannedViewport!.width / 2,
    pannedViewport!.y + pannedViewport!.height / 2,
  );
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(
    pannedViewport!.x + pannedViewport!.width / 2 + 35,
    pannedViewport!.y + pannedViewport!.height / 2 + 25,
    { steps: 4 },
  );
  await page.mouse.up({ button: "middle" });

  const sourcePort = state.nth(0).getByRole("button", { name: "Create transition from Idle", exact: true });
  let sourcePortBounds = await sourcePort.boundingBox();
  let destinationBounds = await state.nth(1).boundingBox();
  expect(sourcePortBounds).not.toBeNull();
  expect(destinationBounds).not.toBeNull();
  const freePoint = {
    x: (sourcePortBounds!.x + destinationBounds!.x) / 2,
    y: (sourcePortBounds!.y + destinationBounds!.y) / 2 - 35,
  };
  await page.mouse.move(
    sourcePortBounds!.x + sourcePortBounds!.width / 2,
    sourcePortBounds!.y + sourcePortBounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(freePoint.x, freePoint.y, { steps: 6 });

  const connectionPreview = editor.locator(".animator-graph-connection-preview");
  const connectionPreviewLine = connectionPreview.locator(".animator-graph-connection-preview__line");
  await expect(connectionPreview).toHaveCount(1);
  await expect(connectionPreview).toHaveAttribute("data-status", "free");
  await expect(editor.locator('.animator-graph-edge[data-kind="transition"]')).toHaveCount(0);
  const previewVisual = await connectionPreviewLine.evaluate((path) => {
    const geometry = path as SVGPathElement;
    const matrix = geometry.getScreenCTM();
    if (!matrix) throw new Error("Expected a screen transform for the connection preview.");
    const startPoint = geometry.getPointAtLength(0);
    const start = new DOMPoint(startPoint.x, startPoint.y).matrixTransform(matrix);
    const endPoint = geometry.getPointAtLength(geometry.getTotalLength());
    const end = new DOMPoint(endPoint.x, endPoint.y).matrixTransform(matrix);
    const style = getComputedStyle(geometry);
    return {
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      stroke: style.stroke,
      strokeWidth: Number.parseFloat(style.strokeWidth),
      pointerEvents: style.pointerEvents,
    };
  });
  const previewSourceBounds = await state.nth(0).boundingBox();
  expect(previewSourceBounds).not.toBeNull();
  expect(Math.min(
    Math.abs(previewVisual.start.x - previewSourceBounds!.x),
    Math.abs(previewVisual.start.x - (previewSourceBounds!.x + previewSourceBounds!.width)),
    Math.abs(previewVisual.start.y - previewSourceBounds!.y),
    Math.abs(previewVisual.start.y - (previewSourceBounds!.y + previewSourceBounds!.height)),
  )).toBeLessThan(3);
  expect(previewVisual.start.x).toBeGreaterThanOrEqual(previewSourceBounds!.x - 1);
  expect(previewVisual.start.x).toBeLessThanOrEqual(previewSourceBounds!.x + previewSourceBounds!.width + 1);
  expect(previewVisual.start.y).toBeGreaterThanOrEqual(previewSourceBounds!.y - 1);
  expect(previewVisual.start.y).toBeLessThanOrEqual(previewSourceBounds!.y + previewSourceBounds!.height + 1);
  expect(Math.hypot(previewVisual.end.x - freePoint.x, previewVisual.end.y - freePoint.y))
    .toBeLessThan(3);
  expect(previewVisual.stroke).not.toBe("none");
  expect(previewVisual.strokeWidth).toBeGreaterThan(0);
  expect(previewVisual.pointerEvents).toBe("none");

  await page.keyboard.press("Escape");
  await expect(connectionPreview).toHaveCount(0);
  await page.mouse.up();
  await expect(editor.locator('.animator-graph-edge[data-kind="transition"]')).toHaveCount(0);
  await expect(editor.locator(".animator-connection-mode")).toHaveCount(0);

  sourcePortBounds = await sourcePort.boundingBox();
  const exitBounds = await editor.locator('.animator-graph-node[data-kind="exit"]').boundingBox();
  expect(sourcePortBounds).not.toBeNull();
  expect(exitBounds).not.toBeNull();
  await page.mouse.move(
    sourcePortBounds!.x + sourcePortBounds!.width / 2,
    sourcePortBounds!.y + sourcePortBounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    exitBounds!.x + exitBounds!.width / 2,
    exitBounds!.y + exitBounds!.height / 2,
    { steps: 8 },
  );
  await expect(connectionPreview).toHaveAttribute("data-status", "invalid");
  await page.mouse.up();
  await expect(connectionPreview).toHaveCount(0);
  await expect(editor.locator(".animator-connection-mode")).toHaveCount(0);
  await expect(editor.locator(".animator-graph-port--input")).toHaveCount(0);
  await expect(editor.locator('.animator-graph-edge[data-kind="transition"]')).toHaveCount(0);

  sourcePortBounds = await sourcePort.boundingBox();
  destinationBounds = await state.nth(1).boundingBox();
  expect(sourcePortBounds).not.toBeNull();
  expect(destinationBounds).not.toBeNull();
  await page.mouse.move(
    sourcePortBounds!.x + sourcePortBounds!.width / 2,
    sourcePortBounds!.y + sourcePortBounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    destinationBounds!.x + destinationBounds!.width / 2,
    destinationBounds!.y + destinationBounds!.height / 2,
    { steps: 8 },
  );
  await expect(connectionPreview).toHaveAttribute("data-status", "valid");
  await page.mouse.up();

  await expect(connectionPreview).toHaveCount(0);
  await expect(editor.locator('.animator-graph-edge[data-kind="transition"]')).toHaveCount(1);
  const transitionInspector = editor.getByRole("complementary", { name: "Animator context inspector" });
  await expect(transitionInspector.getByText("Crossfade", { exact: true }).first()).toBeVisible();
  await expect(transitionInspector.getByText("Destination & priority", { exact: true })).toHaveCount(0);
  await expect(transitionInspector.getByRole("combobox", { name: "Destination", exact: true })).toHaveCount(0);
  await expect(transitionInspector.getByRole("spinbutton", { name: "Priority", exact: true })).toHaveCount(0);
  await expect(transitionInspector.getByRole("group", { name: /Idle crossfades to Idle 2/ })).toBeVisible();
  await expect(transitionInspector.getByRole("checkbox", { name: "Has Exit Time", exact: true })).toBeChecked();
  const sourceTiming = transitionInspector.getByRole("button", { name: "Resize crossfade in point", exact: true });
  const crossfadeTiming = transitionInspector.getByRole("button", { name: "Move crossfade", exact: true });
  const destinationTiming = transitionInspector.getByRole("button", { name: "Resize crossfade out point", exact: true });
  const sourceClip = transitionInspector.locator(".animator-crossfade-preview__clip.is-source");
  const destinationClip = transitionInspector.locator(".animator-crossfade-preview__clip.is-destination");
  const crossfadeGizmo = transitionInspector.locator(".animator-crossfade-preview__overlay");
  const [sourceTimingBounds, sourceClipBounds, destinationClipBounds, initialCrossfadeBounds] = await Promise.all([
    sourceTiming.boundingBox(),
    sourceClip.boundingBox(),
    destinationClip.boundingBox(),
    crossfadeGizmo.boundingBox(),
  ]);
  expect(sourceTimingBounds).not.toBeNull();
  expect(sourceClipBounds).not.toBeNull();
  expect(destinationClipBounds).not.toBeNull();
  expect(initialCrossfadeBounds).not.toBeNull();
  expect(Math.abs(sourceClipBounds!.y - initialCrossfadeBounds!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(sourceClipBounds!.y - destinationClipBounds!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(
    sourceClipBounds!.x + sourceClipBounds!.width - destinationClipBounds!.x,
  )).toBeLessThanOrEqual(1);
  expect(initialCrossfadeBounds!.x).toBeLessThan(destinationClipBounds!.x);
  expect(initialCrossfadeBounds!.x + initialCrossfadeBounds!.width).toBeGreaterThan(destinationClipBounds!.x);
  await sourceTiming.dispatchEvent("pointerdown", {
    bubbles: true,
    button: 0,
    clientX: sourceTimingBounds!.x + sourceTimingBounds!.width / 2,
    clientY: sourceTimingBounds!.y + sourceTimingBounds!.height / 2,
    pointerId: 41,
    pointerType: "mouse",
  });
  await page.evaluate(({ clientX, clientY }) => {
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX, clientY, pointerId: 41 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX, clientY, pointerId: 41 }));
  }, {
    clientX: sourceTimingBounds!.x + sourceTimingBounds!.width / 2 - 20,
    clientY: sourceTimingBounds!.y + sourceTimingBounds!.height / 2,
  });
  const crossfadeTimingBounds = await crossfadeTiming.boundingBox();
  expect(crossfadeTimingBounds).not.toBeNull();
  await crossfadeTiming.dispatchEvent("pointerdown", {
    bubbles: true,
    button: 0,
    clientX: crossfadeTimingBounds!.x + crossfadeTimingBounds!.width / 2,
    clientY: crossfadeTimingBounds!.y + crossfadeTimingBounds!.height / 2,
    pointerId: 42,
    pointerType: "mouse",
  });
  await page.evaluate(({ clientX, clientY }) => {
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX, clientY, pointerId: 42 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX, clientY, pointerId: 42 }));
  }, {
    clientX: crossfadeTimingBounds!.x + crossfadeTimingBounds!.width / 2 + 8,
    clientY: crossfadeTimingBounds!.y + crossfadeTimingBounds!.height / 2,
  });
  const destinationTimingBounds = await destinationTiming.boundingBox();
  expect(destinationTimingBounds).not.toBeNull();
  await destinationTiming.dispatchEvent("pointerdown", {
    bubbles: true,
    button: 0,
    clientX: destinationTimingBounds!.x + 8,
    clientY: destinationTimingBounds!.y + destinationTimingBounds!.height / 2,
    pointerId: 43,
    pointerType: "mouse",
  });
  await page.evaluate(({ clientX, clientY }) => {
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX, clientY, pointerId: 43 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX, clientY, pointerId: 43 }));
  }, {
    clientX: destinationTimingBounds!.x + 28,
    clientY: destinationTimingBounds!.y + destinationTimingBounds!.height / 2,
  });
  await expect.poll(() => {
    const transition = (fixture.sceneObject()?.animator as {
      controller?: { layers?: Array<{ states?: Array<{ transitions?: Array<{
        duration?: number;
        exitTimeNormalized?: number;
      }> }> }> };
    } | undefined)?.controller?.layers?.[0]?.states?.[0]?.transitions?.[0];
    return {
      exitMovedEarlier: (transition?.exitTimeNormalized ?? 1) < 0.75,
      durationExpanded: (transition?.duration ?? 0) > 0.25,
    };
  }).toEqual({ exitMovedEarlier: true, durationExpanded: true });
  const [resizedSourceClipBounds, resizedDestinationClipBounds] = await Promise.all([
    sourceClip.boundingBox(),
    destinationClip.boundingBox(),
  ]);
  expect(resizedSourceClipBounds).not.toBeNull();
  expect(resizedDestinationClipBounds).not.toBeNull();
  expect(Math.abs(
    resizedSourceClipBounds!.x + resizedSourceClipBounds!.width
      - (sourceClipBounds!.x + sourceClipBounds!.width),
  )).toBeLessThanOrEqual(1);
  expect(Math.abs(
    resizedDestinationClipBounds!.x - destinationClipBounds!.x,
  )).toBeLessThanOrEqual(1);
  await transitionInspector.getByRole("spinbutton", { name: "Crossfade exit time", exact: true }).fill("0.6");
  await transitionInspector.getByRole("spinbutton", { name: "Crossfade exit time", exact: true }).press("Tab");
  await transitionInspector.getByRole("spinbutton", { name: "Crossfade duration", exact: true }).fill("0.4");
  await transitionInspector.getByRole("spinbutton", { name: "Crossfade duration", exact: true }).press("Tab");
  await transitionInspector.getByRole("spinbutton", { name: "Crossfade destination offset", exact: true }).fill("0.15");
  await transitionInspector.getByRole("spinbutton", { name: "Crossfade destination offset", exact: true }).press("Tab");
  const durationMode = transitionInspector.getByRole("combobox", { name: "Duration mode", exact: true });
  await durationMode.selectOption("seconds");
  await durationMode.blur();
  await expect.poll(() => {
    const animator = fixture.sceneObject()?.animator as {
      controller?: { layers?: Array<{
        states?: Array<{ id?: string; transitions?: Array<{
          destination?: { kind?: string; stateId?: string };
          durationMode?: string;
          duration?: number;
          exitTimeNormalized?: number;
          offsetNormalized?: number;
        }> }>;
      }> };
    } | undefined;
    const states = animator?.controller?.layers?.[0]?.states;
    const transition = states?.[0]?.transitions?.[0];
    return {
      transitionCount: states?.[0]?.transitions?.length,
      destinationMatches: transition?.destination?.stateId === states?.[1]?.id,
      durationMode: transition?.durationMode,
      duration: transition?.duration,
      exitTimeNormalized: transition?.exitTimeNormalized,
      offsetNormalized: transition?.offsetNormalized,
    };
  }).toEqual({
    transitionCount: 1,
    destinationMatches: true,
    durationMode: "seconds",
    duration: 0.4,
    exitTimeNormalized: 0.6,
    offsetNormalized: 0.15,
  });
  const [exitFieldBounds, offsetFieldBounds, durationFieldBounds] = await Promise.all([
    transitionInspector.getByRole("spinbutton", {
      name: "Crossfade exit time", exact: true,
    }).boundingBox(),
    transitionInspector.getByRole("spinbutton", {
      name: "Crossfade destination offset", exact: true,
    }).boundingBox(),
    transitionInspector.getByRole("spinbutton", {
      name: "Crossfade duration", exact: true,
    }).boundingBox(),
  ]);
  expect(exitFieldBounds).not.toBeNull();
  expect(offsetFieldBounds).not.toBeNull();
  expect(durationFieldBounds).not.toBeNull();
  expect(Math.abs(exitFieldBounds!.y - offsetFieldBounds!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(exitFieldBounds!.y - durationFieldBounds!.y)).toBeLessThanOrEqual(1);
  expect(exitFieldBounds!.x).toBeLessThan(offsetFieldBounds!.x);
  expect(offsetFieldBounds!.x).toBeLessThan(durationFieldBounds!.x);
  expect(offsetFieldBounds!.width).toBeGreaterThan(exitFieldBounds!.width);
  await expect(sourceClip.locator(".animator-crossfade-preview__time-strip > small"))
    .toHaveText("0.00×");
  await expect(destinationClip.locator(".animator-crossfade-preview__time-strip > small"))
    .toHaveText("0.15×");
  await expect(destinationClip.locator(".animator-crossfade-preview__time-strip > i.is-cycle"))
    .toHaveAttribute("style", /left: 85%/);

  const inspectorResizer = editor.getByRole("separator", {
    name: "Resize Animator Inspector",
    exact: true,
  });
  const [inspectorBoundsBeforeResize, graphBoundsBeforeResize, resizerBounds] = await Promise.all([
    transitionInspector.boundingBox(),
    graphViewport.boundingBox(),
    inspectorResizer.boundingBox(),
  ]);
  expect(inspectorBoundsBeforeResize).not.toBeNull();
  expect(graphBoundsBeforeResize).not.toBeNull();
  expect(resizerBounds).not.toBeNull();
  await inspectorResizer.dispatchEvent("pointerdown", {
    bubbles: true,
    button: 0,
    clientX: resizerBounds!.x + resizerBounds!.width / 2,
    clientY: resizerBounds!.y + 40,
    pointerId: 44,
    pointerType: "mouse",
  });
  await page.evaluate(({ clientX, clientY }) => {
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, clientX, clientY, pointerId: 44,
    }));
    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, clientX, clientY, pointerId: 44,
    }));
  }, {
    clientX: resizerBounds!.x + resizerBounds!.width / 2 - 60,
    clientY: resizerBounds!.y + 40,
  });
  await expect.poll(async () => (await transitionInspector.boundingBox())?.width ?? 0)
    .toBeGreaterThan(inspectorBoundsBeforeResize!.width + 10);
  const graphBoundsAfterResize = await graphViewport.boundingBox();
  expect(graphBoundsAfterResize).not.toBeNull();
  expect(graphBoundsAfterResize!.width).toBeLessThan(graphBoundsBeforeResize!.width - 10);

  const connectorPlaybackFill = editor.locator(".animator-graph-edge__progress");
  const crossfadePlayback = transitionInspector.getByRole("progressbar", {
    name: "Crossfade playback progress",
    exact: true,
  });
  await expect(connectorPlaybackFill).toHaveCount(0);
  await expect(crossfadePlayback).toHaveCount(0);
  await page.getByLabel("Enter Play Mode", { exact: true }).click();
  await expect(connectorPlaybackFill).toHaveCount(1, { timeout: 3_000 });
  await expect(crossfadePlayback).toHaveCount(1);
  await expect.poll(async () => Number(
    await crossfadePlayback.getAttribute("aria-valuenow"),
  )).toBeGreaterThan(0);
  await page.getByLabel("Pause", { exact: true }).click();
  const activeTransitionEdge = editor.locator(
    '.animator-graph-edge[data-kind="transition"][data-playback-progress]',
  );
  const pausedTransitionProgress = await activeTransitionEdge.getAttribute("data-playback-progress");
  const pausedCrossfadeProgress = await crossfadePlayback.getAttribute("aria-valuenow");
  expect(Number(pausedTransitionProgress)).toBeGreaterThan(0);
  await page.waitForTimeout(120);
  await expect(activeTransitionEdge).toHaveAttribute(
    "data-playback-progress",
    pausedTransitionProgress ?? "",
  );
  await expect(crossfadePlayback).toHaveAttribute("aria-valuenow", pausedCrossfadeProgress ?? "");
  await page.getByLabel("Exit Play Mode", { exact: true }).click();
  await expect(connectorPlaybackFill).toHaveCount(0);
  await expect(crossfadePlayback).toHaveCount(0);

  const reversePort = state.nth(1).getByRole("button", {
    name: "Create transition from Idle 2",
    exact: true,
  });
  sourcePortBounds = await reversePort.boundingBox();
  destinationBounds = await state.nth(0).boundingBox();
  expect(sourcePortBounds).not.toBeNull();
  expect(destinationBounds).not.toBeNull();
  await page.mouse.move(
    sourcePortBounds!.x + sourcePortBounds!.width / 2,
    sourcePortBounds!.y + sourcePortBounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    destinationBounds!.x + destinationBounds!.width / 2,
    destinationBounds!.y + destinationBounds!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();

  const transitionEdges = editor.locator('.animator-graph-edge[data-kind="transition"]');
  await expect(transitionEdges).toHaveCount(2);
  const firstStateNodeId = await state.nth(0).getAttribute("data-node-id");
  const secondStateNodeId = await state.nth(1).getAttribute("data-node-id");
  const reciprocalPairs = await transitionEdges.evaluateAll((edges) => edges.map((edge) => [
    edge.getAttribute("data-source-node-id"),
    edge.getAttribute("data-destination-node-id"),
  ]));
  expect(reciprocalPairs).toContainEqual([firstStateNodeId, secondStateNodeId]);
  expect(reciprocalPairs).toContainEqual([secondStateNodeId, firstStateNodeId]);
  const parallelPaths = await transitionEdges.locator(".animator-graph-edge__line")
    .evaluateAll((paths) => paths.map((path) => path.getAttribute("d")));
  expect(new Set(parallelPaths).size).toBe(2);
  expect(parallelPaths.every((path) => path?.includes(" L ") && !path.includes(" C "))).toBe(true);
  const directionArrows = await transitionEdges.locator(".animator-edge-arrow")
    .evaluateAll((arrows) => arrows.map((arrow) => arrow.getAttribute("transform")));
  expect(new Set(directionArrows).size).toBe(2);
  await editor.locator('.animator-graph-edge[data-selected][data-kind="transition"]').focus();
  await page.keyboard.press("Delete");
  await expect(transitionEdges).toHaveCount(1);
  await transitionEdges.nth(0).focus();
  await expect(transitionEdges.nth(0)).toHaveCSS("outline-style", "none");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Delete");
  await expect(transitionEdges).toHaveCount(0);
  await expect(state).toHaveCount(2);
  await expect(page.locator('[data-hierarchy-object-id="hero"]')).toBeVisible();

  sourcePortBounds = await sourcePort.boundingBox();
  destinationBounds = await state.nth(1).boundingBox();
  expect(sourcePortBounds).not.toBeNull();
  expect(destinationBounds).not.toBeNull();
  await page.mouse.move(
    sourcePortBounds!.x + sourcePortBounds!.width / 2,
    sourcePortBounds!.y + sourcePortBounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    destinationBounds!.x + destinationBounds!.width / 2,
    destinationBounds!.y + destinationBounds!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(editor.locator('.animator-graph-edge[data-kind="transition"]')).toHaveCount(1);

  await state.nth(1).getByRole("button", { name: "Select Idle 2", exact: true }).click();
  await page.keyboard.press("Delete");
  await expect(state).toHaveCount(1);
  await expect(editor.locator('.animator-graph-edge[data-kind="transition"]')).toHaveCount(0);
  await state.nth(0).getByRole("button", { name: "Select Idle", exact: true }).click();
  await page.keyboard.press("Delete");

  await expect(state).toHaveCount(0);
  await expect(page.locator('[data-hierarchy-object-id="hero"]')).toBeVisible();
  await expect.poll(() => {
    const hero = fixture.sceneObject();
    const animator = hero?.animator as {
      controller?: { layers?: Array<{ states?: unknown[] }> };
    } | undefined;
    return {
      heroExists: Boolean(hero),
      stateCount: animator?.controller?.layers?.[0]?.states?.length,
    };
  }).toEqual({ heroExists: true, stateCount: 0 });
});

test("scrubs imported Clip keys and authors events in the docked Animation timeline", async ({ page }) => {
  const fixture = await installCharacterFixture(page);
  await page.goto("/");

  const openClipEditor = async () => {
    await page.getByRole("tab", { name: "Project", exact: true }).click();
    const project = page.locator("#editor-dock-surface-project");
    const model = project.locator(".model-tile").filter({ hasText: "Hero Character" });
    await expect(model).toBeVisible();
    const clip = project.locator('.model-subasset-tile[data-local-id="clip:idle"]');
    if (!await clip.isVisible()) {
      await project.getByRole("button", {
        name: "Expand imported contents of Hero Character",
        exact: true,
      }).click();
    }
    await clip.dblclick();
  };
  await openClipEditor();

  await expect(page.getByRole("tab", { name: "Animation", exact: true })).toBeVisible();
  const animation = page.locator("#editor-dock-surface-animation");
  const inspector = page.locator("#editor-dock-surface-inspector");
  const timeline = animation.getByLabel("Idle imported animation timeline", { exact: true });
  await expect(timeline).toBeVisible();
  await expect(animation.locator(".character-preview-workspace")).toHaveCount(0);
  const sceneViewport = page.locator(
    '#editor-dock-surface-scene .three-host[aria-label="3D scene viewport"]',
  );
  await expect(sceneViewport).toHaveAttribute("data-imported-clip-preview", "ready", {
    timeout: 30_000,
  });
  await expect(sceneViewport).toHaveAttribute("data-imported-clip-preview-target", "hero");
  await expect(animation.getByRole("button", {
    name: "Add Animation Event at playhead",
    exact: true,
  })).toHaveCount(0);
  const applyButton = animation.getByRole("button", { name: "Apply & Reimport", exact: true });
  await expect.poll(() => applyButton.evaluate((element) => (
    getComputedStyle(element).backgroundColor
  ))).not.toBe("rgb(255, 255, 255)");

  const loopButton = timeline.getByRole("button", { name: "Loop timeline", exact: true });
  const playButton = timeline.getByRole("button", { name: "Play timeline", exact: true });
  const pauseButton = timeline.getByRole("button", { name: "Pause timeline", exact: true });
  const frameInput = timeline.getByLabel("Animation playhead frame", { exact: true });
  const playhead = timeline.getByRole("slider", { name: "Animation playhead", exact: true });
  const normalizedPlayhead = async () => {
    const current = Number(await playhead.getAttribute("aria-valuenow"));
    const maximum = Number(await playhead.getAttribute("aria-valuemax"));
    return maximum > 0 ? current / maximum : 0;
  };
  await expect(loopButton).toHaveAttribute("aria-pressed", "true");
  await loopButton.click();
  await expect(loopButton).toHaveAttribute("aria-pressed", "false");
  await frameInput.fill("24");
  await playButton.click();
  await expect(pauseButton).toBeVisible();
  await expect.poll(normalizedPlayhead, { timeout: 500 }).toBeLessThan(0.25);
  await frameInput.fill("29");
  await expect(playButton).toBeVisible();
  await expect(playhead).toHaveAttribute("aria-valuenow", "1");
  await loopButton.click();
  await playButton.click();
  await frameInput.fill("29");
  await expect.poll(normalizedPlayhead).toBeLessThan(0.25);
  await expect(pauseButton).toBeVisible();
  await pauseButton.click();
  expect(fixture.importWrites()).toBe(0);

  const positionRow = timeline.locator(".animation-clip-key-row")
    .filter({ hasText: "Hips" })
    .filter({ hasText: "Position" });
  await expect(positionRow).toHaveCount(1);
  await expect(positionRow).toHaveAttribute("data-key-count", "2");
  await expect(positionRow.locator(".animation-clip-key-canvas")).toBeVisible();

  const ruler = timeline.getByLabel("Animation time ruler", { exact: true });
  const rulerBounds = await ruler.boundingBox();
  expect(rulerBounds).not.toBeNull();
  await page.mouse.move(
    rulerBounds!.x + rulerBounds!.width * 0.1,
    rulerBounds!.y + rulerBounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    rulerBounds!.x + rulerBounds!.width * 0.8,
    rulerBounds!.y + rulerBounds!.height / 2,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect.poll(normalizedPlayhead).toBeGreaterThan(0.7);

  const keyRows = timeline.locator(".animation-clip-key-rows");
  await keyRows.evaluate((element) => { element.style.maxHeight = "30px"; });
  await expect.poll(async () => {
    const top = await timeline.locator(".animation-clip-timeline__playhead").boundingBox();
    const bottom = await timeline.locator(
      ".animation-clip-key-row.summary .animation-clip-timeline__playhead-line",
    ).boundingBox();
    return top && bottom ? Math.abs(top.x - bottom.x) : Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(1);
  await keyRows.evaluate((element) => { element.style.removeProperty("max-height"); });

  const rowBounds = await positionRow.boundingBox();
  expect(rowBounds).not.toBeNull();
  await page.mouse.move(
    rowBounds!.x + rowBounds!.width * 0.8,
    rowBounds!.y + rowBounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    rowBounds!.x + rowBounds!.width * 0.25,
    rowBounds!.y + rowBounds!.height / 2,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect.poll(normalizedPlayhead).toBeLessThan(0.35);

  const eventLine = timeline.getByLabel("Animation Event line", { exact: true });
  const eventLineBounds = await eventLine.boundingBox();
  expect(eventLineBounds).not.toBeNull();
  const addEventAtCenter = async () => {
    await page.mouse.click(
      eventLineBounds!.x + eventLineBounds!.width / 2,
      eventLineBounds!.y + eventLineBounds!.height / 2,
      { button: "right" },
    );
    await page.getByRole("menuitem", { name: "Add Animation Event", exact: true }).click();
  };
  await addEventAtCenter();
  const eventInspector = inspector.getByRole("region", { name: "Selected animation event" });
  await expect(animation.getByRole("region", { name: "Selected animation event" })).toHaveCount(0);
  await expect(animation.getByText("Select an event marker to edit it.", { exact: true })).toHaveCount(0);
  await expect(eventInspector).toBeVisible();
  await expect(eventInspector.getByText("Animation Event", { exact: true })).toBeVisible();
  await expect(eventInspector.getByText("Event name", { exact: true })).toBeVisible();
  await expect(eventInspector.getByText("Payload", { exact: true })).toHaveCount(0);
  await eventInspector.getByRole("button", { name: "Delete animation event", exact: true }).click();
  await expect(animation.locator(".animation-clip-event-marker")).toHaveCount(0);
  await expect(eventInspector).toHaveCount(0);

  await addEventAtCenter();
  await expect(eventInspector).toBeVisible();
  await eventInspector.getByLabel("Animation event name", { exact: true }).fill("Footstep");
  await eventInspector.getByLabel("Animation event name", { exact: true }).press("Tab");
  const eventMarker = animation.locator(".animation-clip-event-marker");
  await expect(eventMarker).toHaveCount(1);
  await expect(eventMarker).toHaveAttribute("data-selected", "true");
  await expect(eventMarker.locator(".animation-clip-event-marker__flag")).toBeVisible();
  expect(await eventMarker.locator(".animation-clip-event-marker__flag").evaluate((element) => (
    getComputedStyle(element).transform
  ))).toBe("none");

  const markerBounds = await eventMarker.boundingBox();
  expect(markerBounds).not.toBeNull();
  await page.mouse.move(
    markerBounds!.x + markerBounds!.width / 2,
    markerBounds!.y + markerBounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    eventLineBounds!.x + eventLineBounds!.width * 0.72,
    markerBounds!.y + markerBounds!.height / 2,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect.poll(async () => Number(
    (await eventInspector.locator(".animation-clip-event-inspector__time").textContent())
      ?.replace(" s", ""),
  )).toBeGreaterThan(0.65);
  expect(fixture.importWrites()).toBe(0);

  await page.reload();
  await openClipEditor();
  await expect(animation.getByText("Recovered · Unsaved", { exact: true })).toBeVisible();
  await expect(eventMarker).toHaveCount(1);
  expect(fixture.importWrites()).toBe(0);
  await eventMarker.click();
  await expect(eventInspector).toBeVisible();
  await expect(eventInspector.getByLabel("Animation event name", { exact: true }))
    .toHaveValue("Footstep");

  await applyButton.click();
  await expect.poll(() => fixture.importWrites()).toBe(1);
  expect(fixture.importSettings().clipSettings["clip:idle"]?.events).toEqual([{
    id: expect.any(String),
    name: "Footstep",
    timeSeconds: expect.closeTo(0.72, 1),
    payload: {},
  }]);

  await page.reload();
  await openClipEditor();
  await expect(animation.getByText("Recovered · Unsaved", { exact: true })).toHaveCount(0);
  await expect(eventMarker).toHaveCount(1);
  await eventMarker.click();
  await expect(eventInspector.getByLabel("Animation event name", { exact: true }))
    .toHaveValue("Footstep");

  await page.locator('[data-hierarchy-object-id="hero"]').click();
  await page.getByRole("tab", { name: "Inspector", exact: true }).click();
  await expect(eventInspector).toHaveCount(0);
  await inspector.getByRole("button", { name: "Add Component", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Add Component", exact: true });
  await palette.getByRole("searchbox", { name: "Search palette", exact: true }).fill("Animator");
  await palette.getByRole("button", { name: "Animator Controller", exact: true }).click();
  await inspector.getByRole("button", { name: "Build from 1 Clip", exact: true }).click();
  await inspector.getByRole("button", { name: /Hero Character Controller/ }).click();

  const behaviorMap = page.locator("#editor-dock-surface-animator");
  const state = behaviorMap.locator('.animator-graph-node[data-kind="state"]');
  await state.getByRole("button", { name: /^Select / }).click();
  const summary = behaviorMap.locator(".animator-clip-events-summary");
  await expect(summary.getByText("Clip Events", { exact: true })).toBeVisible();
  await expect(summary.getByRole("button", { name: /Footstep/ })).toBeVisible();
  await expect(summary.getByRole("button", { name: /Add/ })).toHaveCount(0);

  await state.dblclick();
  await expect(page.getByRole("tab", { name: "Animation", exact: true }))
    .toHaveAttribute("aria-selected", "true");
  await expect(animation.getByLabel("Idle imported animation timeline", { exact: true })).toBeVisible();
});

test("adds one scene-owned Animator Controller and opens its Behavior Map workspace", async ({ page }) => {
  const fixture = await installCharacterFixture(page);
  await page.goto("/");

  const inspector = page.locator(".rail-right");
  await inspector.getByRole("button", { name: "Add Component", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Add Component", exact: true });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("heading", { name: "Animation", exact: true })).toBeVisible();
  const panel = palette.locator(":scope > div");
  await expect(panel).toBeInViewport();
  expect(await palette.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
  expect(await palette.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgba(0, 0, 0, 0)");
  expect(await panel.evaluate((element) => {
    const header = element.querySelector(":scope > header");
    const grid = element.querySelector('section[data-category="Physics"] > div');
    return {
      width: Math.round(element.getBoundingClientRect().width),
      headerHeight: Math.round(header?.getBoundingClientRect().height ?? 0),
      columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
    };
  })).toEqual({ width: 680, headerHeight: 46, columns: 4 });
  const horizontalOffset = await panel.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return Math.abs(bounds.left + bounds.width / 2 - window.innerWidth / 2);
  });
  expect(horizontalOffset).toBeLessThan(1);
  await expect.poll(() => panel.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return Math.abs(bounds.top + bounds.height / 2 - window.innerHeight / 2);
  })).toBeLessThan(1);
  await page.getByRole("searchbox", { name: "Search palette", exact: true }).fill("state machine");
  const animator = palette.getByRole("button", { name: "Animator Controller", exact: true });
  await expect(animator).toBeEnabled();
  await animator.click();

  await expect(inspector.locator(".component-card__head").getByText("Animator Controller", { exact: true })).toBeVisible();
  await inspector.getByRole("button", { name: "Build from 1 Clip", exact: true }).click();
  await expect.poll(() => {
    const animatorState = fixture.sceneObject()?.animator as { controller?: { layers?: Array<{ states?: unknown[] }> } } | undefined;
    return animatorState?.controller?.layers?.[0]?.states?.length ?? 0;
  }).toBe(1);
  expect(fixture.controllers()).toHaveLength(0);

  await inspector.getByRole("button", { name: /Hero Character Controller/ }).click();
  const editor = page.locator('#editor-dock-surface-animator');
  const scene = page.locator('#editor-dock-surface-scene');
  await expect(page.getByRole("tab", { name: "Behavior Map", exact: true })).toBeVisible();
  await expect(editor).toBeVisible();
  await expect(scene).toBeVisible();
  await expect(page.locator(".character-asset-dialog")).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Select Reaction Router", exact: true })).toBeVisible();
  await expect(editor.locator('.animator-graph-node[data-kind="state"]')).toHaveCount(1);
  expect(await editor.locator(".animator-graph-panel").evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  )).toBe("none");
  await expect(editor.locator(".animator-workspace__issue-badge")).toHaveCount(0);
  const workspaceLayout = await editor.evaluate((surface) => {
    const bottom = (selector: string) => surface.querySelector(selector)!.getBoundingClientRect().bottom;
    const viewport = surface.querySelector(".animator-graph-viewport")!.getBoundingClientRect();
    const workspace = surface.closest(".editor-dock-workspace")!.getBoundingClientRect();
    const sceneSurface = document.querySelector("#editor-dock-surface-scene")!.getBoundingClientRect();
    const bounds = surface.getBoundingClientRect();
    return {
      surfaceBottom: bounds.bottom,
      surfaceHeight: bounds.height,
      workspaceHeight: workspace.height,
      sceneHeight: sceneSurface.height,
      workspaceBottom: bottom(".animator-workspace"),
      workspaceBodyBottom: bottom(".animator-workspace__body"),
      railBottom: bottom(".animator-workspace__rail"),
      graphBottom: bottom(".animator-graph-panel"),
      inspectorBottom: bottom(".animator-workspace__inspector"),
      viewportBottom: viewport.bottom,
      viewportHeight: viewport.height,
    };
  });
  for (const bottom of [
    workspaceLayout.workspaceBottom,
    workspaceLayout.workspaceBodyBottom,
    workspaceLayout.railBottom,
    workspaceLayout.graphBottom,
    workspaceLayout.inspectorBottom,
    workspaceLayout.viewportBottom,
  ]) expect(Math.abs(bottom - workspaceLayout.surfaceBottom)).toBeLessThanOrEqual(2);
  expect(workspaceLayout.surfaceHeight).toBeLessThan(workspaceLayout.workspaceHeight * 0.55);
  expect(workspaceLayout.sceneHeight).toBeGreaterThan(200);
  expect(workspaceLayout.viewportHeight).toBeGreaterThan(120);

  const graphViewport = editor.locator(".animator-graph-viewport");
  const graphGrid = editor.locator(".animator-graph-grid");
  const viewportBounds = await graphViewport.boundingBox();
  const gridBounds = await graphGrid.boundingBox();
  expect(viewportBounds).not.toBeNull();
  expect(gridBounds).not.toBeNull();
  expect(gridBounds!.width).toBeCloseTo(viewportBounds!.width, 0);
  expect(gridBounds!.height).toBeCloseTo(viewportBounds!.height, 0);
  expect(await graphGrid.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe("none");

  const graphNode = editor.locator('.animator-graph-node[data-kind="state"]');
  await expect(editor.locator('.animator-graph-node[data-kind="entry"]')).toHaveCSS("height", "48px");
  await expect(editor.locator('.animator-graph-node[data-kind="exit"]')).toHaveCSS("height", "48px");
  await expect(graphNode).toHaveCSS("height", "64px");
  await graphNode.getByRole("button", { name: /^Select / }).click();
  const clipInspector = editor.locator(".animator-workspace__inspector");
  await expect(clipInspector.getByText("Clip", { exact: true }).first()).toBeVisible();
  await expect(clipInspector.getByLabel("Clip name", { exact: true })).toBeVisible();
  await expect(clipInspector.getByText("Source", { exact: true })).toHaveCount(0);
  await expect(clipInspector.getByLabel("Source Clip", { exact: true })).toHaveCount(0);
  await expect(clipInspector.getByText("Playback", { exact: true })).toBeVisible();
  await expect(clipInspector.getByLabel("Clip loop mode", { exact: true })).toHaveValue("source");
  await expect(clipInspector.getByLabel("Clip speed", { exact: true })).toHaveValue("1.00");
  await expect(clipInspector.getByText("Speed signal", { exact: true })).toHaveCount(0);
  await expect(clipInspector.getByText("Motion Type", { exact: true })).toHaveCount(0);
  await expect(clipInspector.getByText("Behavior", { exact: true })).toHaveCount(0);
  await expect(clipInspector.getByText("Group", { exact: true })).toHaveCount(0);
  await expect(clipInspector.getByText("Mirror", { exact: true })).toBeVisible();
  await expect(clipInspector.getByText("Foot IK", { exact: true })).toBeVisible();
  await expect(clipInspector.getByRole("button", { name: "Set as Entry Clip", exact: true })).toHaveCount(0);
  const advancedPlayback = clipInspector.locator("details.animator-inspector-advanced");
  await expect(advancedPlayback).not.toHaveAttribute("open", "");
  await expect(advancedPlayback.getByText("Write Defaults", { exact: true })).toBeHidden();
  await advancedPlayback.locator("summary").click();
  await expect(advancedPlayback.getByRole("checkbox", { name: "Write Defaults", exact: true })).toBeChecked();
  await clipInspector.getByLabel("Clip loop mode", { exact: true }).selectOption("once");
  await expect.poll(() => {
    const animator = fixture.sceneObject()?.animator as {
      controller?: { layers?: Array<{ states?: Array<{ motion?: { loopMode?: string } }> }> };
    } | undefined;
    return animator?.controller?.layers?.[0]?.states?.[0]?.motion?.loopMode;
  }).toBe("once");

  const nodeSurface = await graphNode.evaluate((element) => {
    const surface = getComputedStyle(element);
    const title = getComputedStyle(element.querySelector(".animator-graph-node__title")!);
    const marker = getComputedStyle(element.querySelector(".animator-graph-node__marker")!);
    const accentRail = getComputedStyle(element, "::before");
    return {
      backgroundImage: surface.backgroundImage,
      boxShadow: surface.boxShadow,
      outlineStyle: surface.outlineStyle,
      layeredSurface: surface.backgroundColor !== title.backgroundColor,
      markerBackground: marker.backgroundColor,
      markerColor: marker.color,
      accentRail: accentRail.backgroundColor,
      highlightPlane: getComputedStyle(element, "::after").backgroundColor,
      semanticIcon: element.querySelectorAll(".animator-graph-node__marker .editor-icon").length,
      entryBadge: element.querySelector(".animator-graph-node__default")?.textContent,
      portShadow: getComputedStyle(element.querySelector(".animator-graph-port--output")!).boxShadow,
    };
  });
  expect(nodeSurface).toEqual(expect.objectContaining({
    backgroundImage: "none",
    boxShadow: "none",
    outlineStyle: "solid",
    layeredSurface: true,
    semanticIcon: 1,
    entryBadge: "Entry",
    portShadow: "none",
  }));
  expect(nodeSurface.accentRail).not.toBe("rgba(0, 0, 0, 0)");
  expect(nodeSurface.highlightPlane).not.toBe("rgba(0, 0, 0, 0)");
  expect(nodeSurface.markerBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(nodeSurface.markerColor).not.toBe(nodeSurface.markerBackground);
  expect(nodeSurface.markerColor).toBe(nodeSurface.accentRail);

  const graphWorld = editor.locator(".animator-graph-world");
  const transformBeforePan = await graphWorld.getAttribute("style");
  const panViewportBounds = await graphViewport.boundingBox();
  expect(panViewportBounds).not.toBeNull();
  await page.mouse.move(
    panViewportBounds!.x + 16,
    panViewportBounds!.y + 16,
  );
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(
    panViewportBounds!.x + 76,
    panViewportBounds!.y + 56,
    { steps: 4 },
  );
  await page.mouse.up({ button: "middle" });
  await expect.poll(() => graphWorld.getAttribute("style")).not.toBe(transformBeforePan);
  const pannedTransform = await graphWorld.getAttribute("style");
  const behaviorMapTab = page.getByRole("tab", { name: "Behavior Map", exact: true });
  await behaviorMapTab.click({ button: "right" });
  const tabMenu = page.getByRole("menu", { name: "Behavior Map tab options", exact: true });
  await expect(tabMenu).toBeVisible();
  await expect(tabMenu.getByText("Add Tab", { exact: true })).toBeVisible();
  await tabMenu.getByRole("menuitem", { name: "Maximize", exact: true }).click();
  await expect(scene).toBeHidden();
  await expect.poll(async () => editor.evaluate((surface) => {
    const bounds = surface.getBoundingClientRect();
    const workspace = surface.closest(".editor-dock-workspace")!.getBoundingClientRect();
    return Math.max(
      Math.abs(bounds.left - workspace.left),
      Math.abs(bounds.top - workspace.top),
      Math.abs(bounds.right - workspace.right),
      Math.abs(bounds.bottom - workspace.bottom),
    );
  })).toBeLessThanOrEqual(1);
  await expect(graphWorld).toHaveAttribute("style", pannedTransform ?? "");
  await behaviorMapTab.click({ button: "right" });
  await page.getByRole("menu", { name: "Behavior Map tab options", exact: true })
    .getByRole("menuitem", { name: "Restore", exact: true }).click();
  await expect(scene).toBeVisible();
  await expect(graphWorld).toHaveAttribute("style", pannedTransform ?? "");
  await editor.getByTitle("Reset graph view", { exact: true }).click();
  await expect.poll(() => graphWorld.evaluate((world) => ({
    transform: getComputedStyle(world).transform,
    willChange: getComputedStyle(world).willChange,
  }))).toEqual({ transform: "none", willChange: "auto" });

  const nodeBeforeMarquee = await graphNode.boundingBox();
  expect(nodeBeforeMarquee).not.toBeNull();
  const transformBeforeMarquee = await graphWorld.getAttribute("style");
  await page.mouse.move(nodeBeforeMarquee!.x - 8, nodeBeforeMarquee!.y - 8);
  await page.mouse.down();
  await page.mouse.move(
    nodeBeforeMarquee!.x + nodeBeforeMarquee!.width + 8,
    nodeBeforeMarquee!.y + nodeBeforeMarquee!.height + 8,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(graphNode).toHaveAttribute("data-selected", "true");
  await expect(graphWorld).toHaveAttribute("style", transformBeforeMarquee ?? "");

  const edge = editor.locator(".animator-graph-edge__line").first();
  const edgeBeforeDrag = await edge.getAttribute("d");
  const nodeDragHandle = graphNode.getByRole("button", { name: /^Select / });
  const nodeBounds = await nodeDragHandle.boundingBox();
  const currentViewportBounds = await graphViewport.boundingBox();
  expect(nodeBounds).not.toBeNull();
  expect(currentViewportBounds).not.toBeNull();
  const dragStart = {
    x: Math.min(nodeBounds!.x + 12, currentViewportBounds!.x + currentViewportBounds!.width - 12),
    y: nodeBounds!.y + nodeBounds!.height / 3,
  };
  const dragHitTarget = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return target instanceof Element
      ? target.closest(".animator-graph-node__drag")?.getAttribute("aria-label")
      : null;
  }, dragStart);
  expect(dragHitTarget).toMatch(/^Select /);
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(currentViewportBounds!.x - 120, dragStart.y + 30, { steps: 6 });
  await expect.poll(() => edge.getAttribute("d")).not.toBe(edgeBeforeDrag);
  await page.mouse.up();
  await expect.poll(() => graphNode.evaluate((node) => Number.parseFloat((node as HTMLElement).style.left)))
    .toBeLessThan(0);
  await expect(editor.getByText("Parameters", { exact: true })).toBeVisible();
  await expect(editor.getByText("Semantic Signals", { exact: true })).toHaveCount(0);
  await behaviorMapTab.click({ button: "middle" });
  await expect(editor).toBeHidden();
  await expect.poll(() => fixture.sceneWrites()).toBeGreaterThan(0);

  await page.reload();
  const reloadedInspector = page.locator(".rail-right");
  await expect(reloadedInspector.locator(".component-card__head")
    .getByText("Animator Controller", { exact: true })).toBeVisible();
  expect(((fixture.sceneObject()?.animator as {
    controller?: { layers?: Array<{ states?: unknown[] }> };
  } | undefined)?.controller?.layers?.[0]?.states) ?? []).toHaveLength(1);

  await reloadedInspector.getByRole("button", { name: "Add Component", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search palette", exact: true }).fill("Animator");
  await expect(page.getByRole("button", { name: "Animator Controller", exact: true })).toHaveCount(0);
  await expect(page.getByText("No matching results", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
});

test("places a rigged model, builds a playable controller, and exposes Play Mode clearly", async ({ page }) => {
  const fixture = await installCharacterFixture(page);
  await page.goto("/");

  await page.locator(".model-tile").filter({ hasText: "Hero Character" }).dblclick();
  const inspector = page.locator(".rail-right");
  await expect(inspector.locator(".component-card__head").getByText("Animator Controller", { exact: true })).toBeVisible();
  await expect(inspector.getByLabel("Animator Avatar", { exact: true })).not.toHaveValue("");

  await inspector.getByRole("button", { name: "Build from 1 Clip", exact: true }).click();
  expect(fixture.controllers()).toHaveLength(0);

  await inspector.getByRole("button", { name: "Add Component", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Physics", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Character Controller", exact: true }).click();
  await expect(inspector.getByText("Character Controller", { exact: true })).toBeVisible();
  await expect(inspector.getByRole("switch", { name: "Enable Character Controller", exact: true })).toBeChecked();
  await expect(inspector.getByLabel("Character Controller Capsule Collider", { exact: true })).not.toHaveValue("");

  await expect.poll(() => {
    const inserted = fixture.sceneObjects().find((object) => object.id !== "hero" && object.name === "Hero Character");
    return inserted ? {
      hasAnimator: Boolean(inserted.animator),
      embeddedStates: (((inserted.animator as { controller?: { layers?: Array<{ states?: unknown[] }> } } | undefined)
        ?.controller?.layers?.[0]?.states) ?? []).length,
      hasController: Boolean(inserted.character_controller),
      bodyType: (inserted.rigidbody as { body_type?: string } | undefined)?.body_type,
      colliderShape: ((inserted.colliders as Array<{ shape?: string }> | undefined) ?? [])[0]?.shape,
    } : null;
  }).toEqual({
    hasAnimator: true,
    embeddedStates: 1,
    hasController: true,
    bodyType: "kinematic",
    colliderShape: "capsule",
  });

  const topbar = page.locator(".topbar");
  const transport = page.getByRole("toolbar", { name: "Scene playback", exact: true });
  const transportButtons = transport.locator(".playback-button");
  await expect(transportButtons).toHaveCount(3);
  const transportChrome = await transport.evaluate((element) => {
    const buttons = [...element.querySelectorAll<HTMLElement>(".playback-button")];
    const bounds = buttons.map((button) => button.getBoundingClientRect());
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      borderStyle: style.borderTopStyle,
      radius: Number.parseFloat(style.borderTopLeftRadius),
      equalWidths: bounds.every((boundsItem) => Math.abs(boundsItem.width - bounds[0]!.width) < 0.1),
      contiguous: bounds.slice(1).every((boundsItem, index) => Math.abs(boundsItem.left - bounds[index]!.right) < 0.1),
    };
  });
  expect(transportChrome.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(transportChrome.borderStyle).toBe("solid");
  expect(transportChrome.radius).toBeGreaterThan(0);
  expect(transportChrome.equalWidths).toBe(true);
  expect(transportChrome.contiguous).toBe(true);
  await expect(page.locator(".animator-playback-issues")).toHaveCount(0);
  const readTransportGeometry = () => transport.evaluate((element) => {
    const readBounds = (target: Element) => {
      const { x, y, width, height } = target.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      transport: readBounds(element),
      buttons: [...element.querySelectorAll(".playback-button")].map(readBounds),
    };
  });
  const editPlayButton = page.getByLabel("Enter Play Mode", { exact: true });
  const editBorder = await topbar.evaluate((element) => getComputedStyle(element).borderBottomColor);
  const editPlayBackground = await editPlayButton.evaluate((element) => getComputedStyle(element).backgroundColor);
  const editTransportGeometry = await readTransportGeometry();
  await expect(page.locator(".scene-playback-status")).toHaveCount(0);
  await editPlayButton.hover();
  await page.mouse.down();
  expect(await readTransportGeometry()).toEqual(editTransportGeometry);
  await page.mouse.up();
  const activePlayButton = page.getByLabel("Exit Play Mode", { exact: true });
  await expect(activePlayButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-playback-mode", "playing");
  await expect(topbar).toHaveAttribute("data-playback-mode", "playing");
  await expect.poll(() => topbar.evaluate((element) => getComputedStyle(element).borderBottomColor))
    .not.toBe(editBorder);
  await page.waitForTimeout(200);
  expect(await readTransportGeometry()).toEqual(editTransportGeometry);
  const activePlayBackground = await activePlayButton.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(activePlayBackground).not.toBe(editPlayBackground);
  await activePlayButton.hover();
  await expect.poll(() => activePlayButton.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe(activePlayBackground);
  await page.waitForTimeout(250);
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await expect(page.getByRole("application", { name: "Game view — playing", exact: true })).toBeVisible();
  await expect(page.locator(".game-view__mode-badge")).toHaveText("PLAYING");
  await page.getByLabel("Pause", { exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-playback-mode", "paused");
  const resumeButton = page.getByLabel("Resume", { exact: true });
  await expect(resumeButton).toHaveAttribute("aria-pressed", "true");
  await expect(activePlayButton).toHaveAttribute("aria-pressed", "true");
  await expect(activePlayButton).toHaveCSS("background-color", activePlayBackground);
  await resumeButton.click();

  await activePlayButton.click();
  await expect(editPlayButton).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(0, 0);
  await expect(editPlayButton).toHaveCSS("background-color", editPlayBackground);
  await expect(page.locator(".app-shell")).toHaveAttribute("data-playback-mode", "edit");
});
