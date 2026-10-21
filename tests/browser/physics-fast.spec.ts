import { expect, test } from "playwright/test";
for (const large of [false, true]) test(`a 1000 m/s sphere cannot cross a 5 cm wall in the ${large ? "large" : "small"} world`, async ({ page }) => {
  await page.goto(`/tests/browser/fixtures/webgpu.html?fast=1${large ? "&large=1" : ""}`);
  await page.waitForFunction(() => Boolean(window.__physicsWebGpuFixture));
  const result = await page.evaluate(() => window.__physicsWebGpuFixture!);
  expect(result.status, JSON.stringify(result)).toBe("passed");
  expect(result.validationErrors).toEqual([]); expect(result.uncapturedErrors).toEqual([]);
  expect(result.settled![4]).toBeCloseTo(-0.525, 2);
  expect(result.later![4]).toBeCloseTo(-0.525, 2);
});
