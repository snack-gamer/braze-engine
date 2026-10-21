import { expect, test } from "playwright/test";
for (const large of [false, true]) test(`world anchors, four joint types and a linked chain hold on the ${large ? "large" : "small"} GPU schedule`, async ({ page }) => {
  await page.goto(`/tests/browser/fixtures/joint-physics.html${large ? "?large=1" : ""}`);
  await expect(page.locator("#result")).not.toHaveText("running");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result)).toBe("passed"); expect(result.errors).toEqual([]);
  expect(result.distance).toBeCloseTo(2, 2); expect(result.ballGap).toBeLessThan(0.015); expect(result.hingeGap).toBeLessThan(0.015);
  expect(result.poses.fixed.position[1]).toBeCloseTo(3, 3);
  expect(result.poses.fixed.orientation[3]).toBeCloseTo(1, 3);
  expect(result.chainGaps.every((gap: number) => gap < 0.035), JSON.stringify(result)).toBe(true);
  const q = result.poses.hinge.orientation;
  expect(Math.abs(q[0]) + Math.abs(q[1])).toBeLessThan(0.01);
  expect(Math.abs(2 * Math.atan2(q[2], q[3]))).toBeLessThan(31 * Math.PI / 180);
});
