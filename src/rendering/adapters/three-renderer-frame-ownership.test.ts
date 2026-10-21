import { describe, expect, it, vi } from "vitest";
import type { ViewportRenderer } from "../../three/renderer";
import { claimThreeRendererFrameOwnership } from "./three-renderer-frame-ownership";

describe("Three renderer frame ownership", () => {
  it("stops the internal loop and preserves Three's FRAME node lifecycle", () => {
    const stop = vi.fn();
    const nodeFrame = {
      frameId: 0,
      update: vi.fn(function update(this: { frameId: number }) {
        this.frameId += 1;
      }),
    };
    const renderer = {
      _animation: { stop },
      _nodes: { nodeFrame },
      info: { autoReset: true, frame: 0 },
    } as unknown as ViewportRenderer;

    const ownership = claimThreeRendererFrameOwnership(renderer);

    expect(stop).toHaveBeenCalledOnce();
    expect(renderer.info.autoReset).toBe(false);
    ownership.advanceFrame();
    ownership.advanceFrame();
    expect(nodeFrame.update).toHaveBeenCalledTimes(2);
    expect(renderer.info.frame).toBe(2);
  });

  it("fails explicitly when the pinned Three lifecycle seam changes", () => {
    expect(() => claimThreeRendererFrameOwnership({} as ViewportRenderer)).toThrow(
      "without its r184 frame lifecycle",
    );
  });
});
