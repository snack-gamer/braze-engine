import { expect, test, type Page, type Route } from "playwright/test";

type JsonRecord = Record<string, unknown>;

/** Row metrics that the density tokens in theme.css must drive. */
const measureRow = (row: Element) => ({
  rowHeight: row.getBoundingClientRect().height,
  fontSize: getComputedStyle(row.querySelector(".object-name")!).fontSize,
  typeIconSize: row.querySelector(".object-row__type-icon")!.getBoundingClientRect().width,
});

test("hierarchy density toggle switches between large and compact rows and persists", async ({ page }) => {
  await installHierarchyFixture(page);
  await page.goto("/");

  const child = page.locator('[data-hierarchy-object-id="child"]');
  const toggle = page.getByRole("button", { name: "Compact rows" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(await child.evaluate(measureRow)).toEqual({ rowHeight: 24, fontSize: "14px", typeIconSize: 22 });

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(await child.evaluate(measureRow)).toEqual({ rowHeight: 18, fontSize: "12.5px", typeIconSize: 16 });

  await page.reload();
  await expect(page.getByRole("button", { name: "Compact rows" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator('[data-hierarchy-object-id="child"]').evaluate(measureRow))
    .toEqual({ rowHeight: 18, fontSize: "12.5px", typeIconSize: 16 });

  await page.getByRole("button", { name: "Compact rows" }).click();
  expect(await page.locator('[data-hierarchy-object-id="child"]').evaluate(measureRow))
    .toEqual({ rowHeight: 24, fontSize: "14px", typeIconSize: 22 });
});

test("hierarchy presents structure and accepts a full trailing root drop", async ({ page }) => {
  await installHierarchyFixture(page);
  await page.goto("/");

  const tree = page.getByRole("tree", { name: "Scene objects" });
  await expect(tree).toBeVisible();

  const light = page.locator('[data-hierarchy-object-id="light"]');
  const content = page.locator('[data-hierarchy-object-id="group"]');
  await expect(light).toHaveAttribute("aria-selected", "false");
  await expect(light).not.toHaveClass(/\bactive\b/);
  await expect(content).toHaveAttribute("aria-selected", "true");

  const child = page.locator('[data-hierarchy-object-id="child"]');
  await expect(child.locator(".hierarchy-tree-guide--branch")).toHaveCount(1);
  await expect(child).toHaveAttribute("aria-level", "2");
  expect(await child.evaluate(measureRow)).toEqual({ rowHeight: 24, fontSize: "14px", typeIconSize: 22 });

  const mesh = page.locator('[data-hierarchy-object-id="mesh"]');
  await expect(mesh.locator('[data-hierarchy-component-id="meshFilter"]')).toBeVisible();
  await expect(mesh.locator('[data-hierarchy-component-id="meshRenderer"]')).toBeVisible();

  const tail = page.locator("[data-hierarchy-tail-drop]");
  const tailHeight = await tail.evaluate((element) => element.getBoundingClientRect().height);
  expect(tailHeight).toBeGreaterThanOrEqual(64);

  await light.dragTo(tail, { targetPosition: { x: 24, y: 44 } });
  await expect.poll(async () => page.locator("[data-hierarchy-object-id]").evaluateAll((rows) => (
    rows.map((row) => row.getAttribute("data-hierarchy-object-id"))
  ))).toEqual(["camera", "group", "child", "mesh", "light"]);
});

async function installHierarchyFixture(page: Page) {
  const objects = [
    sceneObject("camera", "Main Camera", "camera", null, {
      camera: { target: [0, 0, 0], fov_degrees: 52, near: 0.1, far: 200 },
    }),
    sceneObject("light", "Directional Light", "directionalLight", null, {
      directional_light: { enabled: true, color: "#ffffff", intensity: 1, cast_shadows: true },
    }),
    sceneObject("group", "Characters", "transform"),
    sceneObject("child", "Hero Body", "cube", "group"),
    sceneObject("mesh", "Environment", "fbx", null, {
      mesh_filter: { enabled: true },
      mesh_renderer: { enabled: true, cast_shadows: true, receive_shadows: true },
    }),
  ];
  let revision = 1;

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/scenes/current") {
      if (request.method() !== "GET") revision += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          revision: `hierarchy-${revision}`,
          scene: {
            version: "braze-engine/scene-v1",
            lightingAuthoringVersion: 2,
            activeObjectId: null,
            activeCameraId: "camera",
            objects,
          },
        }),
      });
      return;
    }
    if (pathname === "/api/project") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          revision: "project-1",
          sectionRevisions: { materials: "materials-1", assets: "assets-1" },
          project: { materials: [], assets: { folders: [], itemFolders: {}, itemNames: {} } },
        }),
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
}

function sceneObject(
  id: string,
  name: string,
  sourceType: string,
  parentId: string | null = null,
  patch: JsonRecord = {},
): JsonRecord {
  return {
    id,
    name,
    source_type: sourceType,
    parent_id: parentId,
    color: "#b8c0c5",
    visible: true,
    locked: false,
    transform: {
      position: [0, 0, 0],
      rotation_degrees: [0, 0, 0],
      scale: [1, 1, 1],
    },
    ...patch,
  };
}
