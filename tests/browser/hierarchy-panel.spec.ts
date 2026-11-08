import { expect, test, type Page, type Route } from "playwright/test";

type JsonRecord = Record<string, unknown>;

/** Row metrics that the density tokens in theme.css must drive. */
const measureRow = (row: Element) => ({
  rowHeight: row.getBoundingClientRect().height,
  fontSize: getComputedStyle(row.querySelector(".object-name")!).fontSize,
  typeIconSize: row.querySelector(".object-row__type-icon")!.getBoundingClientRect().width,
});

test("hierarchy keeps create and search above the collapsible scene", async ({ page }) => {
  await installHierarchyFixture(page);
  await page.goto("/");
  const root = page.locator(".scene-hierarchy__root");
  const toolbar = page.getByRole("toolbar", { name: "Hierarchy tools" });
  const tree = page.getByRole("tree", { name: "Scene objects" });
  await expect(root).toBeVisible();
  const [rootBox, toolbarBox] = await Promise.all([root.boundingBox(), toolbar.boundingBox()]);
  expect(rootBox!.y).toBeGreaterThanOrEqual(toolbarBox!.y + toolbarBox!.height);
  expect(rootBox!.height).toBe(22);
  await root.click();
  await expect(tree).toBeHidden();
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: "Create object" }).click();
  await expect(page.getByRole("menuitem", { name: "Cube", exact: true })).toBeVisible();
  await toolbar.getByRole("button", { name: "Create object" }).click();
  await page.getByRole("textbox", { name: "Search hierarchy" }).fill("Hero");
  await expect(tree).toBeVisible();
  await expect(root).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-hierarchy-object-id="child"]')).toBeVisible();
  await expect(page.locator('[data-hierarchy-object-id="light"]')).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search hierarchy" }).fill("");
  await expect(page.locator('[data-hierarchy-object-id="light"]')).toBeVisible();
  await page.getByRole("button", { name: "Compact rows" }).click();
  expect((await root.boundingBox())!.height).toBe(18);
});

test("hierarchy density toggle switches between large and compact rows and persists", async ({ page }) => {
  await installHierarchyFixture(page);
  await page.goto("/");

  const child = page.locator('[data-hierarchy-object-id="child"]');
  const toggle = page.getByRole("button", { name: "Compact rows" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(await child.evaluate(measureRow)).toEqual({ rowHeight: 22, fontSize: "13px", typeIconSize: 16 });
  await expectPackedActions(page);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(await child.evaluate(measureRow)).toEqual({ rowHeight: 18, fontSize: "12.5px", typeIconSize: 16 });
  await expectPackedActions(page);

  await page.reload();
  await expect(page.getByRole("button", { name: "Compact rows" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator('[data-hierarchy-object-id="child"]').evaluate(measureRow))
    .toEqual({ rowHeight: 18, fontSize: "12.5px", typeIconSize: 16 });

  await page.getByRole("button", { name: "Compact rows" }).click();
  expect(await page.locator('[data-hierarchy-object-id="child"]').evaluate(measureRow))
    .toEqual({ rowHeight: 22, fontSize: "13px", typeIconSize: 16 });
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
  expect(await child.evaluate(measureRow)).toEqual({ rowHeight: 22, fontSize: "13px", typeIconSize: 16 });

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

async function expectPackedActions(page: Page) {
  const componentGaps = await page.locator(".object-row:has(.modifier-tag)").evaluateAll((rows) => rows.map((row) => {
    const lastComponent = row.querySelector(".modifier-tag:last-child")!.getBoundingClientRect();
    const firstAction = row.querySelector(".object-actions > :first-child")!.getBoundingClientRect();
    return firstAction.left - lastComponent.right;
  }));
  for (const gap of componentGaps) expect(gap).toBeCloseTo(0, 1);
  const pitches = await page.locator(".object-row:has(.modifier-tag)").evaluateAll((rows) => rows.map((row) => {
    const boxes = [...row.querySelectorAll(".modifier-tag svg, .object-actions svg")].map((icon) => icon.getBoundingClientRect());
    return boxes.slice(1).map((box, index) => box.x + box.width / 2 - boxes[index].x - boxes[index].width / 2);
  }));
  for (const row of pitches) for (const pitch of row) expect(pitch).toBeCloseTo(row[0], 1);
  const rows = await page.locator(".object-actions").evaluateAll((groups) => groups.map((group) =>
    Array.from(group.children, (action) => {
      const bounds = action.getBoundingClientRect(), style = getComputedStyle(action);
      return { title: action.getAttribute("title"), left: bounds.left, right: bounds.right,
        opacity: style.opacity, visibility: style.visibility, glyphs: action.querySelectorAll("svg").length };
    })));
  const camera = rows.find((actions) => actions.some((action) => action.title === "Look through this camera"))!;
  expect(camera).toHaveLength(4);
  expect(camera[0].title).toBe("Look through this camera");
  for (const actions of rows) {
    expect(actions.length).toBe(actions === camera ? 4 : 3);
    for (const [index, action] of actions.entries()) {
      expect(action.visibility).toBe("visible"); expect(action.opacity).toBe("1"); expect(action.glyphs).toBe(1);
      if (index > 0) expect(action.left - actions[index - 1].right).toBeCloseTo(0, 1);
    }
    const common = actions.slice(-3);
    expect(common.map((action) => action.title)).toEqual([
      "Solo — hide everything else", "Hide in editor", "Lock (prevent select + transform)",
    ]);
    common.forEach((action, index) => expect(action.left).toBeCloseTo(camera[index + 1].left, 1));
  }
}

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
