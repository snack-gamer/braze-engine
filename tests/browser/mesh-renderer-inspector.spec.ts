import { expect, test, type Page } from "playwright/test";

type JsonRecord = Record<string, unknown>;

test("Mesh Renderer follows Unity's material-array workflow", async ({ page }) => {
  const fixture = await installMeshRendererFixture(page);
  await page.goto("/");

  const inspector = page.locator(".rail-right");
  const meshFilter = inspector.locator(".mesh-filter-section");
  const meshRenderer = inspector.locator(".mesh-renderer-section");
  await expect(meshFilter).toBeVisible();
  await expect(meshRenderer).toBeVisible();
  await expect(meshFilter.locator(".inspector-section__title-icon .editor-icon"))
    .toHaveAttribute("data-icon", "meshFilter");
  await expect(meshFilter.getByRole("checkbox", { name: "Enable Mesh Filter" })).toHaveCount(0);
  await expect(meshRenderer.getByRole("checkbox", { name: "Enable Mesh Renderer" })).toBeChecked();

  await expect(meshRenderer.locator("summary").filter({ hasText: "Materials" })).toBeVisible();
  await expect(meshRenderer.getByLabel("Material count", { exact: true })).toHaveText("2");
  await expect(meshRenderer.getByRole("list", { name: "Renderer materials" })).toBeVisible();
  await expect(meshRenderer.getByRole("listitem")).toHaveCount(2);
  await expect(meshRenderer.getByText("Element 0", { exact: true })).toBeVisible();
  await expect(meshRenderer.getByText("Element 1", { exact: true })).toBeVisible();
  await expect(meshRenderer.getByText("Material Slots", { exact: true })).toHaveCount(0);
  await expect(meshRenderer.getByText("Slot 0", { exact: true })).toHaveCount(0);

  const revealMaterial = meshRenderer.getByRole("button", { name: "Reveal Popped in Project" });
  await expect(revealMaterial).toBeVisible();
  await expect(meshRenderer.getByRole("button", { name: "Reveal Trim in Project" })).toBeVisible();
  await expect(meshRenderer.getByRole("combobox", { name: /Material for Element/ })).toHaveCount(0);

  const layout = await meshRenderer.evaluate((element) => {
    const row = element.querySelector<HTMLElement>(".mesh-renderer-material-row")!;
    const label = row.querySelector<HTMLElement>(".mesh-renderer-material-row__label")!.getBoundingClientRect();
    const field = row.querySelector<HTMLElement>(".mesh-renderer-material-field")!.getBoundingClientRect();
    const count = element.querySelector<HTMLElement>(".mesh-renderer-foldout__meta")!;
    return {
      fieldAfterLabel: field.left >= label.right,
      compactRow: row.getBoundingClientRect().height <= 38,
      countHasWell: getComputedStyle(count).borderTopWidth !== "0px",
      noOverflow: element.scrollWidth <= element.clientWidth + 1,
    };
  });
  expect(layout).toEqual({
    fieldAfterLabel: true,
    compactRow: true,
    countHasWell: true,
    noOverflow: true,
  });

  const writesBeforeEdits = fixture.writes();
  await meshRenderer.getByRole("combobox", { name: "Cast Shadows" }).selectOption("off");
  await meshRenderer.getByRole("checkbox", { name: "Receive Shadows" }).uncheck();
  await meshRenderer.getByRole("checkbox", { name: "Include in Render" }).uncheck();

  await expect(meshRenderer.getByRole("combobox", { name: "Cast Shadows" })).toHaveValue("off");
  await expect(meshRenderer.getByRole("checkbox", { name: "Receive Shadows" })).not.toBeChecked();
  await expect(meshRenderer.getByRole("checkbox", { name: "Include in Render" })).not.toBeChecked();
  await expect.poll(() => fixture.writes()).toBeGreaterThan(writesBeforeEdits);

  const assetSearch = page.getByRole("textbox", { name: "Search assets" });
  const assetFilter = page.getByRole("button", { name: "All assets", exact: true });
  await assetSearch.fill("does-not-match");
  await page.getByRole("button", { name: "All Models", exact: true }).click();
  await page.getByRole("button", { name: "Smaller tiles", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Tile size", exact: true })).toHaveValue("60");
  await revealMaterial.click();

  await expect(assetSearch).toHaveValue("");
  await expect(assetFilter).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".assets__crumb.current")).toHaveText("Characters");
  const revealedTile = page.locator(".asset-tile").filter({ hasText: "Popped" });
  await expect(revealedTile).toBeVisible();
  await expect(revealedTile.locator(".asset-tile__name")).toHaveText("Popped");
  await expect(revealedTile.locator(".asset-tile__name")).not.toContainText("/");
  const materialPreview = revealedTile.locator(".asset-tile__swatch");
  await expect(materialPreview).toHaveAttribute("data-material-preview-status", "ready", { timeout: 30_000 });
  await expect(materialPreview.locator("img")).toBeVisible();
  await expect(revealedTile).toHaveClass(/\bselected\b/);
  await expect(revealedTile).toHaveClass(/\bfocused\b/);
  await expect(meshRenderer).toBeVisible();
  await expect(inspector.getByRole("heading", { name: "Material", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await revealedTile.click();
  await expect(meshRenderer).toHaveCount(0);
  await expect(inspector.getByRole("heading", { name: "Material", exact: true })).toBeVisible();
});

test("component menus and enabled checkboxes work independently of disclosure", async ({ page }) => {
  await installMeshRendererFixture(page);
  await page.goto("/");
  const inspector = page.locator(".rail-right");
  const renderer = inspector.locator(".mesh-renderer-section");
  const disclosure = renderer.getByRole("button", { name: "Mesh Renderer", exact: true });
  const enabled = renderer.getByRole("checkbox", { name: "Enable Mesh Renderer" });
  await enabled.focus();
  await page.keyboard.press("Space");
  await expect(enabled).not.toBeChecked();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(enabled).toBeChecked();
  const options = renderer.getByRole("button", { name: "Mesh Renderer options" });
  await options.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Mesh Renderer options" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Remove Component" })).toBeFocused();
  const menuBox = await menu.boundingBox();
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(options).toBeFocused();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await disclosure.focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(disclosure).toBeFocused();
  await page.keyboard.press("Space");
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await options.click();
  await menu.getByRole("menuitem", { name: "Remove Component" }).click();
  await expect(renderer).toHaveCount(0);
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect(renderer).toBeVisible();
});

test("camera identity and projection edits retain target orientation through reset and reload", async ({ page }) => {
  await installMeshRendererFixture(page);
  await page.goto("/");
  await page.locator('[data-hierarchy-object-id="camera"]').click();
  const inspector = page.locator(".rail-right");
  const name = inspector.getByRole("textbox", { name: "Object name" });
  await name.fill("");
  await name.pressSequentially("Review Camera");
  await name.press("Tab");
  await expect(page.locator('[data-hierarchy-object-id="camera"] .object-name')).toHaveText("Review Camera");
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect(name).toHaveValue("Camera");
  await page.getByRole("button", { name: /^Redo/ }).click();
  await expect(name).toHaveValue("Review Camera");
  await name.fill("Cancelled rename");
  await name.press("Escape");
  await expect(name).toHaveValue("Review Camera");
  const fov = inspector.getByRole("spinbutton", { name: "Field of View", exact: true });
  await fov.fill("64");
  await fov.press("Enter");
  const target = inspector.getByRole("spinbutton", { name: "Target Y", exact: true });
  await target.fill("4");
  await target.press("Enter");
  await inspector.getByRole("button", { name: "Camera options" }).click();
  await page.getByRole("menuitem", { name: "Reset", exact: true }).click();
  await expect(fov).toHaveValue("52");
  await expect(target).toHaveValue("4.00");
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect(fov).toHaveValue("64");
  await page.getByRole("button", { name: /^Save scene \(/ }).click();
  await expect(page.getByRole("button", { name: /^Save scene \(/ })).toHaveAttribute("title", /saved/);
  await page.reload();
  await expect(inspector.getByRole("textbox", { name: "Object name" })).toHaveValue("Review Camera");
  await expect(inspector.getByRole("spinbutton", { name: "Field of View", exact: true })).toHaveValue("64");
  await expect(inspector.getByRole("spinbutton", { name: "Target Y", exact: true })).toHaveValue("4.00");
  await expect(inspector.locator('.inspector-section__title-icon [data-icon="objectCamera"]')).toHaveCount(1);
  await expect(inspector.getByRole("button", { name: "Lens", exact: true })).toHaveCount(0);
});

test("Tag and Layer menus open Inspector settings and preserve stable layer assignment", async ({ page }) => {
  await installMeshRendererFixture(page);
  await page.goto("/");
  const layer = page.getByRole("combobox", { name: "Object layer", exact: true });
  await layer.selectOption("__add_layer__");
  const settings = page.locator(".project-identity-inspector");
  await expect(settings).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const name = settings.getByRole("textbox", { name: "Layer 8 name", exact: true });
  await name.fill("Actors"); await name.press("Enter");
  await expect(name).toHaveValue("Actors");
  await settings.getByRole("button", { name: "Back to object Inspector" }).click();
  await expect(layer.locator('option[value="8"]')).toHaveText("Actors");
  await layer.selectOption("8");
  await page.getByRole("button", { name: /^Save scene \(/ }).click();
  await expect(page.getByRole("button", { name: /^Save scene \(/ })).toHaveAttribute("title", /saved/);
  await page.reload(); await expect(layer).toHaveValue("8");
  await page.getByLabel("Object tag", { exact: true }).selectOption("__add_tag__");
  await expect(settings.getByLabel("New tag name", { exact: true })).toBeVisible();
});

test("short narrow Inspectors keep identity and tag rows separate from components", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await installMeshRendererFixture(page);
  await page.goto("/");
  await expect(page.getByLabel("Object name", { exact: true })).toBeVisible();
  const bounds = await page.locator(".rail-right").evaluate((pane) => {
    const header = pane.querySelector(".panel-header")!.getBoundingClientRect();
    const identity = pane.querySelector(".entity-tag-header")!.getBoundingClientRect();
    const first = pane.querySelector(".inspector-section")!.getBoundingClientRect();
    const content = pane.querySelector(".rail-scroll")!;
    return { headerHeight: header.height, headerBottom: header.bottom, identityTop: identity.top,
      identityBottom: identity.bottom, firstTop: first.top, width: content.clientWidth, scrollWidth: content.scrollWidth };
  });
  expect(bounds.headerHeight).toBeGreaterThanOrEqual(22);
  expect(bounds.identityTop).toBeGreaterThanOrEqual(bounds.headerBottom);
  expect(bounds.firstTop).toBeGreaterThanOrEqual(bounds.identityBottom);
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width);
});

test("Inspector tags create, select and remove without blocking the workspace", async ({ page }) => {
  await installMeshRendererFixture(page); await page.goto("/");
  await page.getByLabel("Object tag", { exact: true }).selectOption("__add_tag__");
  const settings = page.locator(".project-identity-inspector");
  await expect(settings.getByText("List is empty", { exact: true })).toBeVisible();
  await settings.getByLabel("New tag name", { exact: true }).fill("Player");
  await settings.getByLabel("New tag name", { exact: true }).press("Enter");
  await expect(settings.getByLabel("Tag Player name", { exact: true })).toHaveValue("Player");
  await expect(settings.getByLabel("New tag name", { exact: true })).toHaveCount(0);
  await settings.getByRole("button", { name: "Remove selected tag" }).click();
  await expect(settings.getByText("List is empty", { exact: true })).toBeVisible();
  await page.locator('.object-row').filter({ hasText: "Camera" }).click();
  await expect(settings).toHaveCount(0);
  await expect(page.getByLabel("Object name", { exact: true })).toHaveValue("Camera");
});

test("saved tag usage refreshes after external object deletion without reopening settings", async ({ page }) => {
  const fixture = await installMeshRendererFixture(page); await page.goto("/");
  fixture.setSavedTagUsage([{ tag: "Enemy", kind: "scene", source: "Other.scene", objectId: "enemy", objectName: "Enemy object" }]);
  await page.getByLabel("Object tag", { exact: true }).selectOption("__add_tag__");
  const settings = page.locator(".project-identity-inspector");
  await settings.getByLabel("Tag Enemy name", { exact: true }).click();
  await settings.getByText("Usage: Enemy", { exact: true }).click();
  await expect(settings.getByText("Saved project: 1 assignments", { exact: true })).toBeVisible();
  await settings.getByRole("button", { name: "Register tag", exact: true }).click();
  await expect(settings.getByLabel("Tag Enemy name", { exact: true })).toBeVisible();
  fixture.setSavedTagUsage([]);
  await expect(settings.getByText("Saved project: 0 assignments", { exact: true })).toBeVisible({ timeout: 8000 });
  await expect(settings.getByLabel("Tag Enemy name", { exact: true })).toBeVisible();
  await expect(settings.getByRole("button", { name: "Remove selected tag", exact: true })).toBeEnabled();
});

test("tag names rename inline with conflicts, cancellation and usage protection", async ({ page }) => {
  const fixture = await installMeshRendererFixture(page); await page.goto("/");
  await page.getByLabel("Object tag", { exact: true }).selectOption("__add_tag__");
  const settings = page.locator(".project-identity-inspector");
  const create = async (name: string) => {
    if (!await settings.getByLabel("New tag name", { exact: true }).count()) await settings.getByRole("button", { name: "Add tag", exact: true }).click();
    await settings.getByLabel("New tag name", { exact: true }).fill(name);
    await settings.getByLabel("New tag name", { exact: true }).press("Enter");
    await expect(settings.getByLabel(`Tag ${name} name`, { exact: true })).toBeVisible();
  };
  await create("Player"); await create("Enemy");
  const enemy = settings.getByLabel("Tag Enemy name", { exact: true });
  await enemy.fill("Player"); await enemy.press("Enter");
  await expect(settings.getByRole("alert")).toContainText('already exists');
  await enemy.fill("Enemy Name"); await enemy.press("Enter");
  await expect(settings.getByRole("alert")).toContainText('Tags require');
  await enemy.fill("Untagged"); await enemy.press("Enter");
  await expect(settings.getByRole("alert")).toContainText('reserved');
  await enemy.fill("Draft"); await enemy.press("Escape"); await expect(enemy).toHaveValue("Enemy");
  fixture.setSavedTagUsage([{ tag: "Enemy", kind: "prefab", source: "Enemy.prefab", objectId: "enemy", objectName: "Enemy" }]);
  await settings.getByRole("button", { name: "Add tag", exact: true }).click();
  await settings.getByLabel("New tag name", { exact: true }).fill("Other");
  const releaseUsage = fixture.holdUsage();
  await enemy.fill("Hostile"); await enemy.press("Enter");
  await expect(settings.getByRole("button", { name: "Create", exact: true })).toBeDisabled();
  await expect(settings.getByRole("button", { name: "Remove selected tag" })).toBeDisabled();
  releaseUsage();
  await expect(settings.getByRole("alert")).toContainText('is in use');
  fixture.setSavedTagUsage([]);
  await enemy.fill("Hostile"); await enemy.press("Enter");
  await expect(settings.getByLabel("Tag Hostile name", { exact: true })).toHaveValue("Hostile");
  await settings.getByRole("button", { name: "Back to object Inspector" }).click();
  await expect(page.getByLabel("Object tag", { exact: true }).locator('option[value="Hostile"]')).toHaveCount(1);
  await expect(page.getByLabel("Object tag", { exact: true }).locator('option[value="Enemy"]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Object tag", { exact: true }).locator('option[value="Hostile"]')).toHaveCount(1);
});

async function installMeshRendererFixture(page: Page) {
  let sceneRevision = "scene-1";
  let writes = 0;
  let savedTagUsage: JsonRecord[] = [];
  let usageGate: Promise<void> | null = null;
  let scene: JsonRecord = {
    version: "braze-engine/scene-v1",
    activeObjectId: "mesh",
    objects: [{
      id: "mesh",
      name: "Pop",
      source_type: "cube",
      color: "#d8d8d8",
      visible: true,
      locked: false,
      render_visible: true,
      transform: {
        position: [0, 0, 0],
        rotation_degrees: [0, 0, 0],
        scale: [1, 1, 1],
      },
      mesh_filter: { enabled: true },
      mesh_renderer: { enabled: true, cast_shadows: true, receive_shadows: true },
      imported_material_bindings: [
        { slotKey: "body", materialId: "body-material", sourceName: "Body" },
        { slotKey: "trim", materialId: "trim-material", sourceName: "Trim" },
      ],
    }, {
      id: "camera", name: "Camera", source_type: "camera", visible: true, locked: false,
      transform: { position: [5, 4, 6], rotation_degrees: [0, 0, 0], scale: [1, 1, 1] },
      camera: { target: [0, 0.5, 0], fov_degrees: 52, near: 0.1, far: 200 },
    }],
  };
  const project = {
    materials: [
      { id: "body-material", name: "Hero / Popped", color: "#dec6ad" },
      { id: "trim-material", name: "Hero / Trim", color: "#417e91" },
    ],
    assets: {
      folders: ["Materials", "Materials/Characters"],
      itemFolders: {
        "material:body-material": "Materials/Characters",
        "material:trim-material": "Materials/Characters",
      },
      itemNames: {},
    },
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/entity-tags/usage") {
      if (usageGate) await usageGate;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", complete: true, issues: [], assignments: savedTagUsage }) }); return;
    }
    if (pathname === "/api/project") {
      if (request.method() === "PUT") Object.assign(project, request.postDataJSON().patch ?? {});
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          project,
          revision: "project-1",
          sectionRevisions: { materials: "materials-1", assets: "assets-1" },
        }),
      });
      return;
    }
    if (pathname === "/api/scenes/current") {
      if (request.method() === "PUT") {
        const payload = request.postDataJSON() as { scene?: JsonRecord };
        if (payload.scene) scene = payload.scene;
        sceneRevision = `scene-${Number(sceneRevision.split("-")[1]) + 1}`;
        writes += 1;
      } else if (request.method() === "PATCH") {
        const payload = request.postDataJSON() as { patch?: JsonRecord };
        scene = applyScenePatch(scene, payload.patch ?? {});
        sceneRevision = `scene-${Number(sceneRevision.split("-")[1]) + 1}`;
        writes += 1;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", scene, revision: sceneRevision }),
      });
      return;
    }
    if (request.method() === "GET" && pathname === "/api/assets") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", assets: [] }),
      });
      return;
    }
    if (request.method() === "GET" || request.method() === "HEAD") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok" }),
    });
  });

  return {
    writes: () => writes,
    holdUsage: () => {
      let release!: () => void;
      usageGate = new Promise<void>((resolve) => { release = resolve; });
      return () => { usageGate = null; release(); };
    },
    setSavedTagUsage: (value: JsonRecord[]) => { savedTagUsage = value; },
  };
}

function applyScenePatch(scene: JsonRecord, patch: JsonRecord): JsonRecord {
  const objects = new Map(
    (scene.objects as JsonRecord[]).map((object) => [object.id as string, object]),
  );
  for (const object of (patch.upsertObjects as JsonRecord[] | undefined) ?? []) {
    objects.set(object.id as string, object);
  }
  return {
    ...scene,
    ...((patch.metadata as JsonRecord | undefined) ?? {}),
    objects: [...objects.values()],
  };
}
