import { describe, expect, it } from "vitest";
import {
  nextModelImportSelectionToken,
  type ModelImportSelectionToken,
} from "./useModelImportSettings";

describe("model import settings request ownership", () => {
  it("retains one identity while the selected model is unchanged", () => {
    const current: ModelImportSelectionToken = { filename: "models/hero.glb", generation: 4 };

    expect(nextModelImportSelectionToken(current, "models/hero.glb")).toBe(current);
  });

  it("invalidates an old request even when selection later returns to the same filename", () => {
    const first: ModelImportSelectionToken = { filename: "models/hero.glb", generation: 0 };
    const second = nextModelImportSelectionToken(first, "models/animal.glb");
    const third = nextModelImportSelectionToken(second, "models/hero.glb");

    expect(second).not.toBe(first);
    expect(third).not.toBe(first);
    expect(third).toEqual({ filename: "models/hero.glb", generation: 2 });
  });
});
