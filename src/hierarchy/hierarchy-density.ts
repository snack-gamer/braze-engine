/**
 * Hierarchy row density. `large` is the maximum size; each other step fits more
 * rows on screen. The sizes themselves are theme tokens in `theme.css`.
 */
export const HIERARCHY_DENSITIES = ["large", "compact"] as const;

export type HierarchyDensity = (typeof HIERARCHY_DENSITIES)[number];

export const DEFAULT_HIERARCHY_DENSITY: HierarchyDensity = "large";

/** Accepts stored or unknown input; anything unrecognized falls back to the default. */
export function parseHierarchyDensity(value: unknown): HierarchyDensity {
  return HIERARCHY_DENSITIES.find((density) => density === value) ?? DEFAULT_HIERARCHY_DENSITY;
}

/** The density one press of the toggle moves to, wrapping after the last. */
export function nextHierarchyDensity(current: HierarchyDensity): HierarchyDensity {
  const index = HIERARCHY_DENSITIES.indexOf(current);
  return HIERARCHY_DENSITIES[(index + 1) % HIERARCHY_DENSITIES.length];
}
