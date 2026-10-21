import { expect, test } from "playwright/test";
import type { PhysicsWebGpuFixtureResult } from "./fixtures/webgpu";

test("10,000 dynamic bodies settle on GPU without a fixed body ceiling", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/tests/browser/fixtures/webgpu.html?bodies=10000");
  await page.waitForFunction(() => Boolean(window.__physicsWebGpuFixture), undefined, { timeout: 210_000 });
  const result = await page.evaluate(() => window.__physicsWebGpuFixture) as PhysicsWebGpuFixtureResult;
  expect(result.status, result.error).toBe("passed");
  expect(result.validationErrors).toEqual([]);
  expect(result.uncapturedErrors).toEqual([]);
  expect(result.scale).toMatchObject({ count: 10000, ticks: 90, allFinite: true });
  expect(result.scale!.minimumHeight).toBeGreaterThan(0.45);
  expect(result.scale!.maximumHeight).toBeLessThan(0.55);
});

test("large schedule preserves sphere, stack and rotated box contacts", async ({ page }) => {
  await page.goto("/tests/browser/fixtures/webgpu.html?large=1");
  await page.waitForFunction(() => Boolean(window.__physicsWebGpuFixture));
  const result = await page.evaluate(() => window.__physicsWebGpuFixture) as PhysicsWebGpuFixtureResult;
  expect(result.status, result.error).toBe("passed");
  expect(result.validationErrors).toEqual([]);
  expect(result.uncapturedErrors).toEqual([]);
  for (const [body, height] of [[1, 0.5], [2, 0.5], [3, 1.5], [4, 2.5]]) {
    expect(result.settled![body * 4 + 1]).toBeCloseTo(height, 1);
  }
  expect(result.settled![21]).toBeGreaterThan(0.4);
  expect(result.settled![21]).toBeLessThan(0.9);
});

test("dense contact overflow reports a failure instead of dropping collisions", async ({ page }) => {
  await page.goto("/tests/browser/fixtures/webgpu.html?overflow=1");
  await page.waitForFunction(() => Boolean(window.__physicsWebGpuFixture));
  const result = await page.evaluate(() => window.__physicsWebGpuFixture) as PhysicsWebGpuFixtureResult;
  expect(result.status).toBe("failed");
  expect(result.error).toContain("16 simultaneous contact neighbors");
  expect(result.validationErrors).toEqual([]);
  expect(result.uncapturedErrors).toEqual([]);
});
