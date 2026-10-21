import { describe, expect, it } from "vitest";
import { animatorGraphPositionAfterPointerMove } from "./animator-graph-drag";

describe("animator graph node drag", () => {
  it("moves freely through negative world coordinates", () => {
    expect(animatorGraphPositionAfterPointerMove([20, 10], [-45, -70], 1))
      .toEqual([-25, -60]);
  });

  it("converts screen movement through the current viewport scale", () => {
    expect(animatorGraphPositionAfterPointerMove([100, 80], [30, -20], 0.5))
      .toEqual([160, 40]);
  });
});
