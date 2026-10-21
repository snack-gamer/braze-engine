import { describe, expect, it } from "vitest";
import {
  DEFAULT_HIERARCHY_DENSITY,
  nextHierarchyDensity,
  parseHierarchyDensity,
} from "./hierarchy-density";

describe("hierarchy density", () => {
  it("defaults to the large maximum", () => {
    expect(DEFAULT_HIERARCHY_DENSITY).toBe("large");
  });

  it("toggles between large and compact", () => {
    expect(nextHierarchyDensity("large")).toBe("compact");
    expect(nextHierarchyDensity("compact")).toBe("large");
  });

  it("restores known values and falls back for anything else", () => {
    expect(parseHierarchyDensity("compact")).toBe("compact");
    expect(parseHierarchyDensity("large")).toBe("large");
    expect(parseHierarchyDensity("huge")).toBe("large");
    expect(parseHierarchyDensity(null)).toBe("large");
    expect(parseHierarchyDensity(3)).toBe("large");
  });
});
