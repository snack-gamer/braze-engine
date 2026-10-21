import { useCallback, useEffect, useState } from "react";
import {
  nextHierarchyDensity,
  parseHierarchyDensity,
  type HierarchyDensity,
} from "../hierarchy-density";

/** Versioned so a future density set can migrate without misreading old values. */
export const HIERARCHY_DENSITY_STORAGE_KEY = "braze.editor.hierarchy-density.v1";

function readStoredDensity(): HierarchyDensity {
  try {
    return parseHierarchyDensity(window.localStorage.getItem(HIERARCHY_DENSITY_STORAGE_KEY));
  } catch {
    return parseHierarchyDensity(null);
  }
}

/** Hierarchy row density: a per-user UI preference, never scene data. */
export function useHierarchyDensity() {
  const [density, setDensity] = useState<HierarchyDensity>(readStoredDensity);

  useEffect(() => {
    try {
      window.localStorage.setItem(HIERARCHY_DENSITY_STORAGE_KEY, density);
    } catch {
      // The preference stays usable in memory in private or embedded contexts.
    }
  }, [density]);

  const toggleDensity = useCallback(() => setDensity(nextHierarchyDensity), []);
  return { density, toggleDensity };
}
