import { describe, expect, it } from "vitest";
import { createViewportFrameRateSampler } from "./viewport-frame-rate";

describe("viewport frame-rate sampler", () => {
  it("samples submitted frames on a bounded interval without owning a clock", () => {
    const sampler = createViewportFrameRateSampler();
    expect(sampler.sample(0)).toBeNull();
    expect(sampler.sample(100)).toBeNull();
    expect(sampler.sample(200)).toBeNull();
    expect(sampler.sample(300)).toEqual({ fps: 10, frameMs: 100 });
  });

  it("ignores invalid timestamps and smooths later samples", () => {
    const sampler = createViewportFrameRateSampler();
    expect(sampler.sample(Number.NaN)).toBeNull();
    sampler.sample(0);
    sampler.sample(125);
    expect(sampler.sample(250)?.fps).toBe(8);
    sampler.sample(350);
    expect(sampler.sample(500)?.fps).toBeCloseTo(8);
  });
});
