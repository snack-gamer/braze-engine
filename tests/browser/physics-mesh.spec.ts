import { expect, test } from "playwright/test";
for (const large of [false, true]) test(`static mesh surfaces preserve gaps on the ${large ? "large" : "small"} GPU schedule`, async ({ page }) => {
  await page.goto(`/tests/browser/fixtures/mesh-physics.html${large ? "?large=1" : ""}`);
  await expect(page.locator("#result")).not.toHaveText("running");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result)).toBe("passed"); expect(result.errors).toEqual([]);
  expect(result.positions.box[1]).toBeCloseTo(0.5, 1);
  expect(result.positions.ball[1]).toBeCloseTo(0.5, 1);
  expect(result.positions.capsule[1]).toBeCloseTo(1, 1);
  expect(result.positions.gap[1]).toBeLessThan(-10);
});
