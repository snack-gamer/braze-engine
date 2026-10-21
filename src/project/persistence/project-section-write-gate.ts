import { projectSectionValuesEqual } from "./project-section-merge";

/**
 * Tracks the last canonical value a section was loaded or saved from.
 * Until a canonical load succeeds, writes stay closed even when the browser
 * recovery copy changes.
 */
export function createProjectSectionWriteGate<T>() {
  let hasCanonicalBase = false;
  let canonicalBase: T;

  return {
    acceptCanonicalBase(value: T) {
      canonicalBase = value;
      hasCanonicalBase = true;
    },

    needsPersistence(value: T): boolean {
      return hasCanonicalBase && !projectSectionValuesEqual(value, canonicalBase);
    },
  };
}
