import type { Page } from "playwright/test";

/** Screenshot centroids prove GPU presentation without reading production pose buffers. */
export async function runtimeCharacterPixels(page: Page) {
  const png = await page.getByLabel("Game render viewport", { exact: true }).screenshot();
  return page.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    const cyan = { count: 0, x: 0, y: 0 }, orange = { count: 0, x: 0, y: 0 };
    for (let y = Math.floor(image.height * 0.12); y < image.height * 0.95; y++) for (let x = Math.floor(image.width * 0.08); x < image.width * 0.92; x++) {
      const offset = (y * image.width + x) * 4, r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      const color = r > 70 && r > g * 1.15 && g > b * 1.6 ? orange : g > 50 && g > r * 1.8 && b > r * 2 ? cyan : undefined;
      if (color) { color.count++; color.x += x; color.y += y; }
    }
    for (const color of [cyan, orange]) { color.x /= Math.max(1, color.count); color.y /= Math.max(1, color.count); }
    return { cyan, orange };
  }, png.toString("base64"));
}
