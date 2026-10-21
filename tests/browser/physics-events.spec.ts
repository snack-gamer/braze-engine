import { expect, test } from "playwright/test";
for (const large of [false, true]) test(`GPU transitions survive between event polls on the ${large ? "large" : "small"} schedule`, async ({ page }) => {
  await page.goto(`/tests/browser/fixtures/event-physics.html${large ? "?large=1" : ""}`);
  await expect(page.locator("#result")).not.toHaveText("running");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result)).toBe("passed"); expect(result.errors).toEqual([]);
  const eventsFor = (id: string) => result.events.filter((event: { a: string; b: string }) => event.a === id || event.b === id);
  expect(eventsFor("mover").map((e: { kind: string }) => e.kind)).toEqual(["trigger-enter", "trigger-exit"]);
  expect(eventsFor("kinematic").map((e: { kind: string }) => e.kind)).toEqual(["trigger-enter", "trigger-exit"]);
  expect(eventsFor("kinematic").every((e: { tick: number }) => e.tick === 1)).toBe(true);
  expect(eventsFor("fall").some((e: { kind: string }) => e.kind === "collision-enter")).toBe(true);
  expect(result.tick).toBe(60); expect(result.empty).toBe(0); expect(result.dropped).toBe(0);
});
test("event buffer overflow is reported and draining recovers capacity", async ({ page }) => {
  await page.goto("/tests/browser/fixtures/event-physics.html?overflow=1");
  await expect(page.locator("#result")).not.toHaveText("running");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result)).toBe("passed"); expect(result.errors).toEqual([]);
  expect(result.overflow.count).toBe(result.overflow.capacity); expect(result.overflow.dropped).toBeGreaterThan(0);
});
