import type { Page } from "playwright/test";

/** Character surfaces must follow the shared theme, including user-selected density. */
export function readCharacterTheme(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const color = (token: string) => { probe.style.color = `var(${token})`; return getComputedStyle(probe).color; };
    try {
      const style = getComputedStyle(document.documentElement);
      return {
        controlHeight: Number.parseFloat(style.getPropertyValue("--h-control")),
        compactHeight: Number.parseFloat(style.getPropertyValue("--h-control-compact")),
        danger: color("--danger"), success: color("--success"),
      };
    } finally { probe.remove(); }
  });
}
