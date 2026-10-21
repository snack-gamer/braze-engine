import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { externalRetargetTrackDiagnostics } from "./three-animator-retarget-resolution";

describe("external Three retarget track policy", () => {
  it("reports facial morph tracks that SkeletonUtils cannot transfer", () => {
    const clip = new THREE.AnimationClip("Face", 1, [
      new THREE.NumberKeyframeTrack("Face.morphTargetInfluences[Smile]", [0, 1], [0, 1]),
    ]);

    expect(externalRetargetTrackDiagnostics(clip)).toMatchObject([{
      code: "external-retarget-morph-tracks-unsupported",
      severity: "warning",
    }]);
  });

  it("does not warn for supported bone transform tracks", () => {
    const clip = new THREE.AnimationClip("Body", 1, [
      new THREE.QuaternionKeyframeTrack("Hips.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    ]);

    expect(externalRetargetTrackDiagnostics(clip)).toEqual([]);
  });
});
