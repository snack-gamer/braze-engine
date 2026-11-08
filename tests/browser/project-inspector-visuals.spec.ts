import { expect, test, type Locator, type Page } from "playwright/test";

type FixtureProject = Record<string, unknown> & {
  materials: Array<Record<string, unknown>>;
  assets: {
    folders: string[];
    itemFolders: Record<string, string>;
    itemNames: Record<string, string>;
  };
};

test.describe("Project and Inspector visual regressions", () => {
  test.beforeEach(async ({ page }) => {
    await installProjectFixture(page);
  });

  test("shared glyph metrics survive panel styles and selected tabs stay brighter", async ({ page }) => {
    await page.goto("/");
    const sceneTab = page.getByRole("tab", { name: "Scene", exact: true });
    const gameTab = page.getByRole("tab", { name: "Game", exact: true });
    await expect(sceneTab).toHaveAttribute("aria-selected", "true");
    const activeTone = async () => sceneTab.evaluate((tab) => {
      const shell = tab.closest(".editor-dock-tab-shell")!;
      const bar = tab.closest(".editor-dock-group__tabbar")!;
      const brightness = (element: Element) => {
        const rgb = getComputedStyle(element).backgroundColor.match(/[\d.]+/g)!.map(Number);
        return (rgb[0] + rgb[1] + rgb[2]) / 3;
      };
      return brightness(shell) - brightness(bar);
    });
    expect(await activeTone()).toBeGreaterThan(25);
    await gameTab.click();
    await expect(gameTab).toHaveAttribute("aria-selected", "true");
    await expect(sceneTab).toHaveAttribute("aria-selected", "false");
    await sceneTab.click();
    expect(await activeTone()).toBeGreaterThan(25);
    await page.getByRole("button", { name: "Create or import into Assets", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Create", exact: true })).toBeVisible();
    const violations = await page.locator(".editor-icon").evaluateAll((icons) => icons.flatMap((icon) => {
      const bounds = icon.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return [];
      const style = getComputedStyle(icon);
      const size = Number.parseFloat(style.getPropertyValue("--editor-icon-size"));
      const stroke = Number.parseFloat(style.getPropertyValue("--editor-icon-stroke"));
      return Math.abs(bounds.width - size) > 0.5 || Math.abs(bounds.height - size) > 0.5
        || Number.parseFloat(style.strokeWidth) !== stroke
        ? [{ name: icon.getAttribute("data-icon"), size, width: bounds.width, height: bounds.height }]
        : [];
    }));
    expect(violations).toEqual([]);
  });

  test("pane toolbars align single controls and compound groups to the same height", async ({ page }) => {
    await page.goto("/");
    const toolbars = page.locator(".editor-toolbar");
    await expect(toolbars).toHaveCount(2);
    const measurements = await toolbars.evaluateAll((bars) => bars.map((bar) => {
      const controls = bar.querySelectorAll(":scope > button, :scope > select, :scope > .editor-segmented, :scope > .editor-control-group, .editor-toolbar__search, .editor-toolbar__button, .assets__filters > button");
      return [...controls].map((control) => {
        const bounds = control.getBoundingClientRect();
        return { height: bounds.height, center: bounds.y + bounds.height / 2 };
      });
    }));
    expect(measurements.map((controls) => controls.length)).toEqual([3, 17]);
    for (const controls of measurements) {
      for (const control of controls) {
        expect(control.height).toBe(24);
        expect(Math.abs(control.center - controls[0].center)).toBeLessThan(0.5);
      }
    }
    const search = await page.locator(".assets__search").boundingBox();
    const slider = await page.locator(".assets__zoom .editor-range-control").boundingBox();
    expect(search!.width).toBeLessThanOrEqual(320);
    expect(slider!.width).toBeGreaterThan(100);
    const models = page.getByRole("button", { name: "All Models", exact: true });
    await models.hover();
    const tooltip = await models.evaluate((button) => {
      const style = getComputedStyle(button, "::after");
      return { display: style.display, content: style.content, delay: style.transitionDelay };
    });
    expect(tooltip).toEqual({ display: "block", content: '"Models"', delay: "0s" });
    await models.click();
    await expect(models).toHaveAttribute("aria-pressed", "true");
  });

  test("nonempty folders are filled and Project sidebar labels remain readable", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Character", exact: true })).toHaveCount(0);
    const projectSurface = page.locator('[data-pane-id="project"] .editor-dock-surface__content');
    const assetBrowser = projectSurface.getByRole("complementary", { name: "Project", exact: true });
    const [surfaceBounds, browserBounds] = await Promise.all([
      projectSurface.boundingBox(),
      assetBrowser.boundingBox(),
    ]);
    expect(surfaceBounds).not.toBeNull();
    expect(browserBounds).not.toBeNull();
    expect(Math.abs(surfaceBounds!.width - browserBounds!.width)).toBeLessThanOrEqual(1);

    const projectFolders = page.getByRole("complementary", { name: "Project folders", exact: true });
    const populatedRow = projectFolders.getByRole("treeitem").filter({ hasText: "Populated" });
    const emptyRow = projectFolders.getByRole("treeitem").filter({ hasText: "Empty" });
    await expect(populatedRow).toBeVisible();
    await expect(emptyRow).toBeVisible();

    const populatedIcon = populatedRow.locator(".assets__tree-label .editor-icon");
    const emptyIcon = emptyRow.locator(".assets__tree-label .editor-icon");
    await expect(populatedIcon).toHaveClass(/\beditor-icon--filled\b/);
    await expect(emptyIcon).not.toHaveClass(/\beditor-icon--filled\b/);

    const iconPaint = await populatedIcon.evaluate((icon) => {
      const style = getComputedStyle(icon);
      return { fill: style.fill, color: style.color };
    });
    expect(iconPaint.fill).toBe(iconPaint.color);

    const labelFontSizes = await projectFolders
      .locator(".assets__tree-label > span")
      .evaluateAll((labels) => labels.map((label) => Number.parseFloat(getComputedStyle(label).fontSize)));
    expect(labelFontSizes.length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...labelFontSizes)).toBeGreaterThanOrEqual(12);
  });

  test("Project plus menu is left-anchored and identifies its import destination", async ({ page }) => {
    await page.goto("/");

    const projectToolbar = page.locator(".assets__head-actions");
    const createButton = projectToolbar.getByRole("button", {
      name: "Create or import into Assets",
      exact: true,
    });
    const search = projectToolbar.getByRole("textbox", { name: "Search assets", exact: true });
    await expect(createButton).toBeVisible();
    await expect(createButton).not.toContainText("Import");

    const createBounds = await createButton.boundingBox();
    const searchBounds = await search.boundingBox();
    expect(createBounds).not.toBeNull();
    expect(searchBounds).not.toBeNull();
    expect(createBounds!.x).toBeLessThan(searchBounds!.x);

    await createButton.click();
    const menu = page.getByRole("dialog", { name: "Create", exact: true });
    await expect(menu).toBeVisible();
    await expect(menu.locator(".catalog-palette__item").allTextContents()).resolves.toEqual([
      "Folder",
      "Scene",
      "Avatar Mask",
      "Material",
      "Input Action Map",
      "Project Input Settings",
      "Import Files…",
      "Import Model Folder…",
      "Import Image…",
      "Import HDRI…",
    ]);
    await expect(menu.locator(":scope > div > div > section > header > h3").allTextContents()).resolves.toEqual([
      "Create",
      "World",
      "Animation",
      "Rendering",
      "Input",
      "Import",
    ]);
    const panel = menu.locator(":scope > div");
    expect(await panel.evaluate((element) => {
      const firstItem = element.querySelector(".catalog-palette__item");
      const firstTile = firstItem?.querySelector(":scope > span:first-child");
      return {
        width: Math.round(element.getBoundingClientRect().width),
        itemHeight: Math.round(firstItem?.getBoundingClientRect().height ?? 0),
        tileSize: Math.round(firstTile?.getBoundingClientRect().width ?? 0),
        background: getComputedStyle(element).backgroundColor,
      };
    })).toEqual({
      width: 680,
      itemHeight: 34,
      tileSize: 22,
      background: "rgb(48, 49, 52)",
    });
    await menu.getByRole("searchbox", { name: "Search palette", exact: true }).fill("avatar");
    await expect(menu.getByRole("button", { name: "Avatar Mask", exact: true })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Material", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");

    const projectFolders = page.getByRole("complementary", { name: "Project folders", exact: true });
    await projectFolders.getByRole("treeitem").filter({ hasText: "Populated" }).click();
    await expect(projectToolbar.getByRole("button", {
      name: "Create or import into Assets/Populated",
      exact: true,
    })).toBeVisible();
  });

  test("focusing and dragging an Inspector range does not draw a rectangular outline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("3D scene viewport", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Gizmos", exact: true }).click();
    const range = page.getByRole("slider", { name: "Grid opacity", exact: true });
    await expect(range).toBeVisible();

    await range.focus();
    await expect(range).toBeFocused();
    expectNoRectangularFocus(await rangeChrome(range));

    const before = Number(await range.inputValue());
    const box = await range.boundingBox();
    expect(box).not.toBeNull();
    const bounds = box!;
    await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
    await page.mouse.down();
    try {
      expectNoRectangularFocus(await rangeChrome(range));
      await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.5, { steps: 3 });
      expectNoRectangularFocus(await rangeChrome(range));
    } finally {
      await page.mouse.up();
    }
    expect(Number(await range.inputValue())).not.toBe(before);
  });
});

async function rangeChrome(range: Locator) {
  return range.evaluate((input) => {
    const style = getComputedStyle(input);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
    };
  });
}

function expectNoRectangularFocus(style: Awaited<ReturnType<typeof rangeChrome>>) {
  expect(style.outlineStyle).toBe("none");
  expect(style.outlineWidth).toBe("0px");
  expect(style.boxShadow).toBe("none");
  expect([
    style.borderTopWidth,
    style.borderRightWidth,
    style.borderBottomWidth,
    style.borderLeftWidth,
  ]).toEqual(["0px", "0px", "0px", "0px"]);
}

async function installProjectFixture(page: Page) {
  let sequence = 1;
  let project: FixtureProject = {
    materials: [{ id: "material-in-populated-folder", name: "Folder marker" }],
    assets: {
      folders: ["Empty", "Populated"],
      itemFolders: { "material:material-in-populated-folder": "Populated" },
      itemNames: {},
    },
  };
  let sectionRevisions: Record<string, string> = {
    assets: "assets-1",
    materials: "materials-1",
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/project") {
      if (request.method() === "PUT") {
        const payload = request.postDataJSON() as { patch?: Record<string, unknown> };
        const patch = payload.patch ?? {};
        project = { ...project, ...patch } as FixtureProject;
        sequence += 1;
        sectionRevisions = {
          ...sectionRevisions,
          ...Object.fromEntries(Object.keys(patch).map((section) => [section, `${section}-${sequence}`])),
        };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          project,
          revision: `project-${sequence}`,
          sectionRevisions,
        }),
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
