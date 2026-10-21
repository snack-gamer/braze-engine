import { describe, expect, it } from "vitest";
import {
  MAX_INTERACTIVE_PIXEL_RATIO,
  viewportIsSuspended,
  viewportNeedsAnotherFrame,
  viewportPixelRatio,
  type ViewportFrameActivity,
} from "./viewport-performance";

const idleActivity: ViewportFrameActivity = {
  animatedCloners: false,
  activeModifiers: false,
  activeParticles: false,
  frameSkipped: false,
  deviceTaskPending: false,
  physicsPending: false,
  playbackMode: "edit",
  sceneSettling: false,
  shadowUpdatePending: false,
  transientCameraMotion: false,
};

describe("viewport performance policy", () => {
  it("caps an interactive Retina viewport and keeps explicit output sizes at 1x", () => {
    expect(viewportPixelRatio({ devicePixelRatio: 2, fixedRenderSize: false, lowResolution: false }))
      .toBe(MAX_INTERACTIVE_PIXEL_RATIO);
    expect(viewportPixelRatio({ devicePixelRatio: 2, fixedRenderSize: true, lowResolution: false })).toBe(1);
    expect(viewportPixelRatio({ devicePixelRatio: 2, fixedRenderSize: false, lowResolution: true })).toBe(1);
  });

  it("lets an unchanged edit viewport become idle", () => {
    expect(viewportNeedsAnotherFrame(idleActivity)).toBe(false);
  });

  it("suspends a viewport when its editor surface is covered and removed from layout", () => {
    expect(viewportIsSuspended(false, 1)).toBe(false);
    expect(viewportIsSuspended(true, 1)).toBe(true);
    expect(viewportIsSuspended(false, 0)).toBe(true);
  });

  it.each([
    ["settling", { sceneSettling: true }],
    ["camera motion", { transientCameraMotion: true }],
    ["playback", { playbackMode: "playing" as const }],
    ["particles", { activeParticles: true }],
    ["modifiers", { activeModifiers: true }],
    ["physics", { physicsPending: true }],
    ["device work", { deviceTaskPending: true }],
  ])("continues frames for %s", (_label, patch) => {
    expect(viewportNeedsAnotherFrame({ ...idleActivity, ...patch })).toBe(true);
  });

  it("freezes particle-only viewports while paused", () => {
    expect(viewportNeedsAnotherFrame({ ...idleActivity, activeParticles: true, playbackMode: "paused" })).toBe(false);
  });
});
