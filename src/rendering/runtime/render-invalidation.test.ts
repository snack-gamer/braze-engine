import { describe, expect, it } from "vitest";
import {
  RenderViewInvalidationLedger,
  RenderWorldInvalidationLedger,
  renderViewGenerationChanged,
  renderWorldGenerationChanged,
} from "./render-invalidation";

describe("render invalidation generations", () => {
  it("starts every world channel at the same zero baseline", () => {
    const ledger = new RenderWorldInvalidationLedger();

    expect(ledger.current()).toEqual({
      revision: 0,
      structure: 0,
      transforms: 0,
      poses: 0,
      materials: 0,
      lighting: 0,
      environment: 0,
      particles: 0,
      shadowCasters: 0,
      labels: 0,
    });
  });

  it("publishes one immutable revision for an atomic world change", () => {
    const ledger = new RenderWorldInvalidationLedger();
    const before = ledger.current();
    const after = ledger.invalidate("poses", "shadowCasters", "labels");

    expect(after).not.toBe(before);
    expect(after.revision).toBe(1);
    expect(after.poses).toBe(1);
    expect(after.shadowCasters).toBe(1);
    expect(after.labels).toBe(1);
    expect(after.structure).toBe(0);
    expect(Object.isFrozen(after)).toBe(true);
    expect(renderWorldGenerationChanged(after, before, "poses")).toBe(true);
    expect(renderWorldGenerationChanged(after, before, "materials")).toBe(false);
  });

  it("does not allocate or advance when no channel changed", () => {
    const ledger = new RenderWorldInvalidationLedger();
    const before = ledger.current();

    expect(ledger.invalidate()).toBe(before);
    expect(ledger.current().revision).toBe(0);
  });

  it("keeps view-local invalidation independent from world state", () => {
    const world = new RenderWorldInvalidationLedger();
    const view = new RenderViewInvalidationLedger();
    const consumedView = view.current();

    world.invalidate("lighting");
    const currentView = view.invalidate("camera", "history");

    expect(world.current().revision).toBe(1);
    expect(currentView.revision).toBe(1);
    expect(renderViewGenerationChanged(currentView, consumedView, "camera")).toBe(true);
    expect(renderViewGenerationChanged(currentView, consumedView, "extent")).toBe(false);
  });

  it("resets a disposed session to a fresh zero generation", () => {
    const ledger = new RenderViewInvalidationLedger();
    ledger.invalidate("extent");

    expect(ledger.reset()).toEqual({
      revision: 0,
      camera: 0,
      extent: 0,
      visibility: 0,
      overlays: 0,
      postProcessing: 0,
      history: 0,
    });
  });
});
