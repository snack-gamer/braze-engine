import { expect, test } from "playwright/test";

test("hydrating an unchanged scene does not manufacture an autosave", async ({ page }) => {
  const sceneWrites: string[] = [];
  await page.route("**/api/scenes/current", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          revision: "loaded-revision",
          scene: {
            version: "braze-engine/scene-v1",
            savedAt: "2026-08-30T00:00:00.000Z",
            objects: [],
          },
        }),
      });
      return;
    }
    sceneWrites.push(request.method());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ status: "error", message: "unexpected scene write" }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: /Save scene.*saved/i })).toBeEnabled();
  await page.waitForTimeout(1_200);

  expect(sceneWrites).toEqual([]);
});
