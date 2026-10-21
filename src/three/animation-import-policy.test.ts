import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { animationClipForRootMotionExtraction } from "./animation-clip-loop-pose";
import { applyAnimationImportPolicy } from "./animation-import-policy";

describe("animation import policy", () => {
  it("preserves source clip identity when compression is disabled", () => {
    const source = clip();
    const result = applyAnimationImportPolicy([source], { compression: "off", clipSettings: {} });
    expect(result.animations[0]).toBe(source);
    expect(result.changed).toBe(false);
  });

  it("clones clips and removes redundant interior keys", () => {
    const source = clip();
    const result = applyAnimationImportPolicy([source], {
      compression: "keyframeReduction",
      clipSettings: {},
    });
    expect(result.animations[0]).not.toBe(source);
    expect(result.animations[0]!.tracks[0]!.times.length).toBeLessThan(source.tracks[0]!.times.length);
    expect(result.diagnostics[0]?.code).toBe("animation-keyframe-reduction");
  });

  it("trims inclusive FBX frame ranges with interpolated boundaries before caching", () => {
    const source = new THREE.AnimationClip("Take 001", 2, [
      new THREE.NumberKeyframeTrack(".position[x]", [0, 1, 2], [0, 10, 20]),
    ]);
    const result = applyAnimationImportPolicy([source], {
      compression: "off",
      clipSettings: {
        "clip:Take-001": {
          sourceIndex: 0,
          name: "Middle",
          firstFrame: 15,
          lastFrame: 45,
          looping: false,
        },
      },
    });
    const imported = result.animations[0]!;

    expect(imported).not.toBe(source);
    expect(imported.name).toBe("Middle");
    expect(imported.duration).toBeCloseTo(1);
    expect(Array.from(imported.tracks[0]!.times)).toEqual([0, 0.5, 1]);
    expect(Array.from(imported.tracks[0]!.values)).toEqual([5, 10, 15]);
    expect(Array.from(source.tracks[0]!.times)).toEqual([0, 1, 2]);
    expect(result.diagnostics[0]?.code).toBe("animation-clip-range-applied");
  });

  it("keeps the full source take when persisted timing is stale or invalid", () => {
    const source = clip();
    const result = applyAnimationImportPolicy([source], {
      compression: "off",
      clipSettings: {
        "clip:Idle": {
          sourceIndex: 0,
          firstFrame: 40,
          lastFrame: 10,
          looping: true,
        },
      },
    });

    expect(result.animations[0]).toBe(source);
    expect(result.changed).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("animation-clip-range-invalid");
  });

  it("appends multiple independently trimmed segments from one immutable source take", () => {
    const source = new THREE.AnimationClip("Take", 3, [
      new THREE.NumberKeyframeTrack(".position[x]", [0, 1, 2, 3], [0, 1, 2, 3]),
    ]);
    const result = applyAnimationImportPolicy([source], {
      compression: "off",
      clipSettings: {
        "clip:segment-b": {
          kind: "segment",
          enabled: true,
          sourceIndex: 0,
          name: "Recover",
          firstFrame: 60,
          lastFrame: 90,
          looping: false,
        },
        "clip:segment-a": {
          kind: "segment",
          enabled: true,
          sourceIndex: 0,
          name: "Attack",
          firstFrame: 0,
          lastFrame: 30,
          looping: false,
        },
        "clip:removed": {
          kind: "segment",
          enabled: false,
          sourceIndex: 0,
          looping: true,
        },
      },
    });

    expect(result.animations).toHaveLength(3);
    expect(result.animations.map((clip) => clip.name)).toEqual(["Take", "Attack", "Recover"]);
    expect(result.animations.slice(1).map((clip) => clip.duration)).toEqual([1, 1]);
    expect(result.animations[0]).toBe(source);
  });

  it("distributes an explicitly looped pose delta across position and rotation tracks", () => {
    const start = new THREE.Quaternion();
    const middle = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 3);
    const end = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const source = new THREE.AnimationClip("Evade", 1, [
      new THREE.VectorKeyframeTrack("Hips.position", [0, 0.5, 1], [0, 0, 0, 8, 0, 0, 10, 0, 0]),
      new THREE.QuaternionKeyframeTrack(
        "Hips.quaternion",
        [0, 0.5, 1],
        [...start.toArray(), ...middle.toArray(), ...end.toArray()],
      ),
    ]);
    const result = applyAnimationImportPolicy([source], {
      compression: "off",
      clipSettings: {
        "clip:Evade": { sourceIndex: 0, looping: true, loopPose: true },
      },
    });
    const imported = result.animations[0]!;
    const rootMotionSource = animationClipForRootMotionExtraction(imported);
    const position = imported.tracks[0]!;
    const rotation = imported.tracks[1]!;
    const positionBefore = interpolant(position).evaluate(1 - 1.0e-6);
    const positionAfter = interpolant(position).evaluate(1.0e-6);
    const rotationBefore = new THREE.Quaternion().fromArray(
      interpolant(rotation).evaluate(1 - 1.0e-6),
    );
    const rotationAfter = new THREE.Quaternion().fromArray(
      interpolant(rotation).evaluate(1.0e-6),
    );

    expect(imported).not.toBe(source);
    expect(Math.abs(positionBefore[0]! - positionAfter[0]!)).toBeLessThan(1.0e-4);
    expect(rotationBefore.angleTo(rotationAfter)).toBeLessThan(1.0e-4);
    expect(result.diagnostics.map((item) => item.code)).toContain("animation-loop-pose-applied");
    expect(source.tracks[0]!.values[source.tracks[0]!.values.length - 3]).toBe(10);
    expect(rootMotionSource).not.toBe(imported);
    expect(rootMotionSource.tracks[0]!.values[rootMotionSource.tracks[0]!.values.length - 3]).toBe(10);
  });

  it("retains the authored root-motion curves through animation compression", () => {
    const source = new THREE.AnimationClip("Run", 1, [
      new THREE.VectorKeyframeTrack("Hips.position", [0, 0.5, 1], [
        0, 0, 0,
        3, 0, 0,
        10, 0, 0,
      ]),
    ]);
    const result = applyAnimationImportPolicy([source], {
      compression: "keyframeReduction",
      clipSettings: {
        "clip:Run": { sourceIndex: 0, looping: true, loopPose: true },
      },
    });
    const imported = result.animations[0]!;
    const rootMotionSource = animationClipForRootMotionExtraction(imported);

    const importedValues = imported.tracks[0]!.values;
    const rootMotionValues = rootMotionSource.tracks[0]!.values;
    expect(importedValues[importedValues.length - 3]).toBe(0);
    expect(rootMotionSource).not.toBe(imported);
    expect(rootMotionValues[rootMotionValues.length - 3]).toBe(10);
  });
});

function clip(): THREE.AnimationClip {
  return new THREE.AnimationClip("Idle", 2, [
    new THREE.NumberKeyframeTrack(".position[x]", [0, 1, 2], [1, 1, 1]),
  ]);
}

function interpolant(track: THREE.KeyframeTrack): { evaluate: (time: number) => ArrayLike<number> } {
  return (track as unknown as {
    createInterpolant: () => { evaluate: (time: number) => ArrayLike<number> };
  }).createInterpolant();
}
