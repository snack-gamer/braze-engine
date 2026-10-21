/** Reads a pixel-valued design token that `theme.css` owns; falls back outside a browser or for an unusable value. */
export function readPixelToken(element: Element, name: string, fallback: number): number {
  if (typeof getComputedStyle !== "function") return fallback;
  const value = Number.parseFloat(getComputedStyle(element).getPropertyValue(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
