import { expect, test } from "playwright/test";

test("static player boots the compiled scene without editor APIs or chrome", async ({ page }) => {
  const apiRequests: string[] = [];
  const pageErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) apiRequests.push(url.pathname);
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("/player.html");
  const viewport = page.getByLabel("Game render viewport", { exact: true });
  await expect(viewport).toBeVisible();
  await expect(viewport.locator("canvas")).toBeVisible();
  await expect(viewport.locator(".three-host__fatal")).toHaveCount(0);
  await expect.poll(async () => Number(await viewport.getAttribute("data-render-count")))
    .toBeGreaterThan(0);

  await expect(page.locator(".editor-shell, .scene-label-layer, .viewport-hud")).toHaveCount(0);
  expect(apiRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
});
