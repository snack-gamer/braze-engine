import { expect, test } from "playwright/test";

test("failed project hydration never promotes browser recovery data", async ({ page }) => {
  const projectWrites: string[] = [];
  await page.addInitScript(() => {
    window.localStorage.setItem("braze.materials", JSON.stringify([
      { id: "cached-material", name: "Browser recovery material", color: "#ff00ff" },
    ]));
    window.localStorage.setItem("tgan.folders", JSON.stringify(["cached-folder"]));
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/project" && request.method() === "GET") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ status: "error", message: "temporary project outage" }),
      });
      return;
    }
    if (pathname === "/api/project") projectWrites.push(request.method());
    if (request.method() === "GET" || request.method() === "HEAD") {
      await route.continue();
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok" }),
      });
    }
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: /Project not saved:/ })).toBeVisible();
  await page.waitForTimeout(1_000);

  expect(projectWrites).toEqual([]);
});
