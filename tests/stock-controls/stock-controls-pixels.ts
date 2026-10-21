import type { Page } from "playwright/test";

/** Projected landmark pixels prove the real stock camera moved; no engine/GPU state is read. */
export async function stockControlPixels(page: Page) {
  const png = await page.getByLabel("Game render viewport", { exact: true }).screenshot({
    scale: "css", style: ".game-view__mode-badge, .viewport-hud { visibility: hidden !important; }",
  });
  return page.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    const orange = { count: 0, x: 0, y: 0, width: 0 }, cyan = { count: 0 };
    let minX = image.width, maxX = -1;
    // Playback feedback has a 2 CSS-pixel amber border; one extra pixel excludes antialiasing.
    for (let y = 3; y < image.height - 3; y++) for (let x = 3; x < image.width - 3; x++) {
      const offset = (y * image.width + x) * 4, r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      // Remount rebuilds lighting; marker hue survives even when its shadow face becomes dimmer.
      if (r > 0 && r > g * 1.15 && g > b * 1.6) {
        orange.count++; orange.x += x; orange.y += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      }
      if (g > 50 && g > r * 1.8 && b > r * 2) cyan.count++;
    }
    orange.x /= Math.max(1, orange.count); orange.y /= Math.max(1, orange.count);
    orange.width = maxX < minX ? 0 : maxX - minX + 1;
    return { orange, cyan, width: image.width, height: image.height };
  }, png.toString("base64"));
}
