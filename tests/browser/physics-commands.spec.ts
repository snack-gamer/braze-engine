import { expect, test } from "playwright/test";
for (const large of [false, true]) test(`impulses apply once and kinematic targets stop in the ${large ? "large" : "small"} GPU world`, async ({ page }) => {
  await page.goto(`/tests/browser/fixtures/webgpu.html?commands=1${large ? "&large=1" : ""}`);
  await page.waitForFunction(() => Boolean(window.__physicsWebGpuFixture));
  const result = await page.evaluate(() => window.__physicsWebGpuFixture!);
  expect(result.status, JSON.stringify(result)).toBe("passed");
  expect(result.validationErrors).toEqual([]); expect(result.uncapturedErrors).toEqual([]);
  expect(result.settled![0]).toBeCloseTo(2, 3); expect(result.later![0]).toBeCloseTo(3, 3);
  expect(result.settled![4]).toBeCloseTo(1, 4); expect(result.later![4]).toBeCloseTo(1, 4);
  expect(result.settled![5]).toBeCloseTo(5, 4);
});
