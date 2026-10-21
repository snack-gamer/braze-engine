import { describe, expect, it } from "vitest";
import { selectAssetRange } from "./asset-selection";

describe("selectAssetRange", () => {
  const keys = ["folder:one", "material:a", "model:b", "image:c", "hdri:d"];

  it("selects in visual order in both directions", () => {
    expect([...selectAssetRange(keys, "material:a", null, "image:c")]).toEqual([
      "material:a",
      "model:b",
      "image:c",
    ]);
    expect([...selectAssetRange(keys, "image:c", null, "material:a")]).toEqual([
      "material:a",
      "model:b",
      "image:c",
    ]);
  });

  it("falls back to the target when an anchor was filtered out", () => {
    expect([...selectAssetRange(keys, "model:missing", null, "image:c")]).toEqual(["image:c"]);
  });
});
