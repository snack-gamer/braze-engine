import { expect, test } from "playwright/test";
for (const large of [false, true]) test(`restitution, layer 31 and persistent forces run on the ${large ? "large" : "small"} GPU schedule`, async ({ page }) => {
  await page.goto(`/tests/browser/fixtures/material-physics.html${large ? "?large=1" : ""}`);
  await expect(page.locator("#result")).not.toHaveText("running");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result)).toBe("passed"); expect(result.errors).toEqual([]);
  expect(result.first.bounce[1]).toBeGreaterThan(1.3); expect(result.first.bounce[1]).toBeLessThan(2.05);
  expect(result.first.excluded[1]).toBeLessThan(-2); expect(result.first.included[1]).toBeCloseTo(0.5, 2);
  expect(result.first.force[0]).toBeCloseTo(11.004, 2); expect(result.second.force[0]).toBeCloseTo(13.004, 2);
  expect(result.second.force[1]).toBeCloseTo(2, 3);
});
