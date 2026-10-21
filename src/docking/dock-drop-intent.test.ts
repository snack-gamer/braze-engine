import { describe, expect, it } from "vitest";
import { resolveDockSplitEdge, resolveDockTabPlacement } from "./dock-drop-intent";

describe("dock drop intent", () => {
  it.each([
    [{ x: 8, y: 180 }, "left"],
    [{ x: 392, y: 180 }, "right"],
    [{ x: 200, y: 8 }, "top"],
    [{ x: 200, y: 292 }, "bottom"],
  ] as const)("selects the one closest edge at %o", (point, edge) => {
    expect(resolveDockSplitEdge({ width: 400, height: 300 }, point)).toBe(edge);
  });

  it("leaves the content center neutral instead of exposing competing targets", () => {
    expect(resolveDockSplitEdge({ width: 800, height: 500 }, { x: 400, y: 250 })).toBeNull();
  });

  it("resolves corner overlap to the closest edge", () => {
    expect(resolveDockSplitEdge({ width: 400, height: 300 }, { x: 20, y: 4 })).toBe("top");
  });

  it("places a dragged tab on the pointer side of the hovered tab", () => {
    expect(resolveDockTabPlacement(124, 100, 50)).toBe("before");
    expect(resolveDockTabPlacement(125, 100, 50)).toBe("after");
  });
});
