import { expect, test } from "playwright/test";

test("renderer settings expose the repaired screen-space and hierarchy-light boundary", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem("tgan.inspector.tab.render.sky.section", "sun");
  });
  await page.route("**/api/**", async (route) => {
    const method = route.request().method();
    if (method === "GET" || method === "HEAD") await route.continue();
    else await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/");
  await expect(page.getByLabel("3D scene viewport")).toBeVisible();
  await page.getByRole("button", { name: "Render settings", exact: true }).click();
  await expect(page.getByText("Screen-space Effects", { exact: true })).toBeVisible();
  await expect(page.getByText("Ambient Occlusion", { exact: true })).toBeVisible();
  await expect(page.getByText("Screen-Space GI", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Denoise", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Temporal Cache", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Sky Floor", { exact: true })).toHaveCount(0);

  const worldHeader = page.locator(".inspector-section__head").filter({ hasText: "World" });
  if (await worldHeader.getAttribute("aria-expanded") !== "true") await worldHeader.click();
  const worldSource = page.getByRole("tablist", { name: "World source", exact: true });
  await worldSource.getByRole("tab", { name: "Sky", exact: true }).click();

  const skyTabs = page.getByRole("tablist", { name: "Sky section", exact: true });
  await expect(skyTabs.getByRole("tab", { name: "Sun", exact: true })).toHaveCount(0);
  await expect(skyTabs.getByRole("tab", { name: "Atmosphere", exact: true }))
    .toHaveAttribute("aria-selected", "true");
  await expect(skyTabs.getByRole("tab", { name: "Galaxy", exact: true })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});
