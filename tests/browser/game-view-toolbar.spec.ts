import { expect, test } from "playwright/test";

test("Game Stats keeps its pressed and keyboard-focus indicators inside the dock toolbar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/**", async (route) => {
    const method = route.request().method();
    if (method === "GET" || method === "HEAD") await route.continue();
    else await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Game", exact: true }).click();

  const stats = page.getByRole("button", { name: "Toggle Game view statistics" });
  await expect(stats).toBeVisible();
  if (await stats.getAttribute("aria-pressed") !== "true") await stats.click();
  await expect(stats).toHaveAttribute("aria-pressed", "true");

  const pressedStyle = await stats.evaluate((button) => {
    const buttonBounds = button.getBoundingClientRect();
    const tabbarBounds = button.closest<HTMLElement>(".editor-dock-group__tabbar")!.getBoundingClientRect();
    const style = getComputedStyle(button);
    return {
      buttonTop: buttonBounds.top,
      buttonBottom: buttonBounds.bottom,
      tabbarTop: tabbarBounds.top,
      tabbarBottom: tabbarBounds.bottom,
      borderTopColor: style.borderTopColor,
      boxShadow: style.boxShadow,
    };
  });

  expect(pressedStyle.buttonTop).toBeGreaterThanOrEqual(pressedStyle.tabbarTop);
  expect(pressedStyle.buttonBottom).toBeLessThanOrEqual(pressedStyle.tabbarBottom);
  expect(pressedStyle.borderTopColor).toBe("rgba(0, 0, 0, 0)");
  expect(pressedStyle.boxShadow).toContain("inset");

  await stats.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(stats).toBeFocused();
  const focusStyle = await stats.evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      outlineColor: style.outlineColor,
      outlineOffset: Number.parseFloat(style.outlineOffset),
      outlineStyle: style.outlineStyle,
    };
  });

  expect(focusStyle.outlineStyle).toBe("solid");
  expect(focusStyle.outlineOffset).toBeLessThan(0);
  expect(pressedStyle.boxShadow).not.toContain(focusStyle.outlineColor);
});
