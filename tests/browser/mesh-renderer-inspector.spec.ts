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
    .toHaveClass(/\blucide-panel-top-bottom-dashed\b/);
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
  const assetFilter = page.getByRole("combobox", { name: "Asset type filter" });
  await assetSearch.fill("does-not-match");
  await assetFilter.selectOption("models");
  await page.getByRole("button", { name: "Smaller tiles", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Tile size", exact: true })).toHaveValue("60");
  await revealMaterial.click();

  await expect(assetSearch).toHaveValue("");
  await expect(assetFilter).toHaveValue("all");
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

async function installMeshRendererFixture(page: Page) {
  let sceneRevision = "scene-1";
  let writes = 0;
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
    if (pathname === "/api/project") {
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
