import assert from "node:assert/strict";
import test from "node:test";
import { fbxAnimationTiming, inferredFbxFrameRate } from "./fbx-animation-timing.mjs";

function track(times) {
  return { times: Float32Array.from(times) };
}

test("FBX timing uses the modal curve cadence instead of generated dense keys", () => {
  const thirtyFps = Array.from({ length: 52 }, (_, index) => index / 30);
  const generated = Array.from({ length: 511 }, (_, index) => index / 300);
  const clip = {
    duration: 51 / 30,
    tracks: [track(thirtyFps), track(thirtyFps), track(thirtyFps), track(generated)],
  };

  assert.equal(inferredFbxFrameRate(clip), 30);
  assert.deepEqual(fbxAnimationTiming(clip), {
    frameRate: 30,
    firstFrame: 0,
    lastFrame: 51,
  });
});

test("FBX timing safely falls back when a sparse curve cannot reveal source cadence", () => {
  assert.deepEqual(fbxAnimationTiming({ duration: 2, tracks: [track([0, 2])] }), {
    frameRate: 30,
    firstFrame: 0,
    lastFrame: 60,
  });
});
