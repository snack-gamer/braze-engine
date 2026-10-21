import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { inferredAnimationClipFrameRate } from "./animation-clip-range";

describe("animation clip source timing", () => {
  it("uses modal curve cadence when generated quaternion keys are denser", () => {
    const regular = Array.from({ length: 52 }, (_, index) => index / 30);
    const dense = Array.from({ length: 511 }, (_, index) => index / 300);
    const clip = new THREE.AnimationClip("Spin", 51 / 30, [
      new THREE.NumberKeyframeTrack(".a", regular, regular),
      new THREE.NumberKeyframeTrack(".b", regular, regular),
      new THREE.NumberKeyframeTrack(".c", regular, regular),
      new THREE.NumberKeyframeTrack(".generated", dense, dense),
    ]);

    expect(inferredAnimationClipFrameRate(clip)).toBe(30);
  });
});
