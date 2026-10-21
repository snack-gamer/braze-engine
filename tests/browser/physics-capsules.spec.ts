import { expect, test } from "playwright/test";
for (const large of [false, true]) test(`capsules collide with boxes and spheres in the ${large ? "large" : "small"} GPU world`, async ({ page }) => {
  await page.goto(`/tests/browser/fixtures/webgpu.html?capsules=1${large ? "&large=1" : ""}`);
  await page.waitForFunction(() => Boolean(window.__physicsWebGpuFixture));
  const result = await page.evaluate(() => window.__physicsWebGpuFixture!);
  expect(result.status, JSON.stringify(result)).toBe("passed");
  expect(result.validationErrors).toEqual([]); expect(result.uncapturedErrors).toEqual([]);
  expect(result.settled!.every(Number.isFinite)).toBe(true);
  expect(result.settled![5]).toBeCloseTo(1, 1);
  expect(result.settled![9]).toBeCloseTo(0.5, 1);
  expect(result.settled![17]).toBeCloseTo(1.5, 1);
  expect(result.settled![25]).toBeCloseTo(1.5, 1);
});
