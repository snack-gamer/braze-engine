import type { Page } from "playwright/test";

/** Decode a browser screenshot, never production GPU state. Distinct fixture colors prove visible draws. */
export async function coloredPixels(page: Page) {
  const png = await page.getByLabel("Game render viewport", { exact: true }).screenshot();
  return page.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    let orange = 0, cyan = 0, totalY = 0;
    for (let y = Math.floor(image.height * 0.12); y < image.height * 0.95; y++) for (let x = Math.floor(image.width * 0.08); x < image.width * 0.92; x++) {
      const i = (y * image.width + x) * 4, r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (r > 70 && r > g * 1.15 && g > b * 1.6) { orange++; totalY += y; }
      if (g > 50 && g > r * 1.8 && b > r * 2) cyan++;
    }
    return { orange, cyan, orangeY: totalY / Math.max(1, orange) };
  }, png.toString("base64"));
}
