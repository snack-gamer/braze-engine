import { expect, test, type Locator } from "playwright/test";

test("settled Scene and Game viewports stop submitting GPU frames", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const method = route.request().method();
    if (method === "GET" || method === "HEAD") await route.continue();
    else await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/");
  const sceneViewport = page.getByLabel("3D scene viewport", { exact: true });
  await expect(sceneViewport).toHaveAttribute("data-render-loop", "idle", { timeout: 30_000 });
  await expectSubmittedRenderCountToSettle(sceneViewport);

  await page.getByRole("tab", { name: "Game", exact: true }).click();
  const gameViewport = page.getByLabel("Game render viewport", { exact: true });
  await expect(gameViewport).toBeVisible();
  await expect(gameViewport).toHaveAttribute("data-render-loop", "idle", { timeout: 30_000 });
  await expectSubmittedRenderCountToSettle(gameViewport);
});

async function expectSubmittedRenderCountToSettle(viewport: Locator): Promise<void> {
  await expect.poll(async () => {
    const before = await viewport.getAttribute("data-render-count");
    const loopBefore = await viewport.getAttribute("data-render-loop");
    await viewport.page().waitForTimeout(400);
    const after = await viewport.getAttribute("data-render-count");
    const loopAfter = await viewport.getAttribute("data-render-loop");
    return Number(before) > 0 && before === after && loopBefore === "idle" && loopAfter === "idle";
  }, { timeout: 30_000 }).toBe(true);
}
