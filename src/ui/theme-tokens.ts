/** Reads a pixel-valued design token that `theme.css` owns; falls back outside a browser or for an unusable value. */
export function readPixelToken(element: Element, name: string, fallback: number): number {
  if (typeof getComputedStyle !== "function") return fallback;
  const value = Number.parseFloat(getComputedStyle(element).getPropertyValue(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Read editor palette values once when constructing GPU editor helpers. */
export function readEditorColorToken(name: string, fallback: string): string {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function readEditorNumberToken(name: string, fallback: number): number {
  const value = Number.parseFloat(readEditorColorToken(name, ""));
  return Number.isFinite(value) ? value : fallback;
}
