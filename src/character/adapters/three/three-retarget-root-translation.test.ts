import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { restoreThreeRetargetHipBaseline } from "./three-retarget-root-translation";

describe("Three retarget root translation", () => {
  it("adds the target Avatar rest position without changing motion deltas", () => {
    const track = new THREE.VectorKeyframeTrack(
      ".bones[Hips].position",
      [0, 1],
      [0, 0, 0, 2, -0.5, 1],
    );
    const clip = new THREE.AnimationClip("Move", 1, [track]);

    const result = restoreThreeRetargetHipBaseline(
      clip,
      "Hips",
      new THREE.Vector3(0, 1.25, 0),
    );

    expect(result.diagnostics).toEqual([]);
    expect([...track.values]).toEqual([0, 1.25, 0, 2, 0.75, 1]);
  });

  it("leaves clips without hips translation untouched", () => {
    const clip = new THREE.AnimationClip("Turn", 1, [
      new THREE.QuaternionKeyframeTrack(
        ".bones[Hips].quaternion",
        [0, 1],
        [0, 0, 0, 1, 0, 0, 0, 1],
      ),
    ]);

    expect(restoreThreeRetargetHipBaseline(
      clip,
      "Hips",
      new THREE.Vector3(0, 1, 0),
    ).value).toBe(clip);
  });
});
