import { describe, expect, it } from "vitest";
import {
  createImportedClipTimelinePresentation,
  IMPORTED_CLIP_TIMELINE_LIMITS,
  importedClipTrackLabels,
} from "./imported-clip-presentation";

describe("imported Clip timeline presentation", () => {
  it("copies exact key times and derives stable target/property labels", () => {
    const presentation = createImportedClipTimelinePresentation({
      clipName: "Idle",
      durationSeconds: 1.25,
      frameRate: 60,
      tracks: [
        {
          name: "Armature/Hips.quaternion",
          keyTimesSeconds: Float32Array.from([0, 0.25, 1.25]),
        },
        {
          name: "Face.morphTargetInfluences[Smile]",
          keyTimesSeconds: Float32Array.from([0, 0.5, 1]),
        },
      ],
    });

    expect(presentation).toMatchObject({
      clipName: "Idle",
      durationSeconds: 1.25,
      frameRate: 60,
      keyframeCount: 6,
      displayedKeyframeCount: 6,
      truncated: false,
    });
    expect(presentation.rows).toEqual([
      {
        id: "track:0:Armature/Hips.quaternion",
        targetLabel: "Armature/Hips",
        propertyLabel: "Rotation",
        keyTimesSeconds: [0, 0.25, 1.25],
        keyframeCount: 3,
        truncated: false,
      },
      {
        id: "track:1:Face.morphTargetInfluences[Smile]",
        targetLabel: "Face",
        propertyLabel: "Blend Shape · Smile",
        keyTimesSeconds: [0, 0.5, 1],
        keyframeCount: 3,
        truncated: false,
      },
    ]);
    expect(Object.isFrozen(presentation)).toBe(true);
    expect(Object.isFrozen(presentation.rows)).toBe(true);
    expect(Object.isFrozen(presentation.rows[0])).toBe(true);
    expect(Object.isFrozen(presentation.rows[0]?.keyTimesSeconds)).toBe(true);
  });

  it("recognizes Three bone accessors and safely labels root tracks", () => {
    expect(importedClipTrackLabels(".bones[mixamorig:Hips].position")).toEqual({
      targetLabel: "mixamorig:Hips",
      propertyLabel: "Position",
    });
    expect(importedClipTrackLabels(".scale")).toEqual({
      targetLabel: "Root",
      propertyLabel: "Scale",
    });
  });

  it("bounds rows and samples exact source keys across an oversized track", () => {
    const maximumKeys = IMPORTED_CLIP_TIMELINE_LIMITS.maximumKeyTimes;
    const oversizedTimes = Float32Array.from(
      { length: maximumKeys + 2 },
      (_, index) => index * 0.25,
    );
    const tracks = Array.from(
      { length: IMPORTED_CLIP_TIMELINE_LIMITS.maximumRows + 1 },
      (_, index) => ({
        name: `Bone ${index}.position`,
        keyTimesSeconds: index === 0 ? oversizedTimes : Float32Array.from([0]),
      }),
    );
    const presentation = createImportedClipTimelinePresentation({
      clipName: "Oversized",
      durationSeconds: oversizedTimes[oversizedTimes.length - 1]!,
      tracks,
    });

    expect(presentation.rows).toHaveLength(IMPORTED_CLIP_TIMELINE_LIMITS.maximumRows);
    expect(presentation.displayedKeyframeCount)
      .toBeLessThanOrEqual(IMPORTED_CLIP_TIMELINE_LIMITS.maximumKeyTimes);
    expect(presentation.rows[0]?.keyTimesSeconds[0]).toBe(0);
    expect(presentation.rows[0]?.keyTimesSeconds[presentation.rows[0].keyTimesSeconds.length - 1])
      .toBe(oversizedTimes[oversizedTimes.length - 1]);
    expect(presentation.rows[0]?.truncated).toBe(true);
    expect(presentation.truncated).toBe(true);
  });

  it("infers a modal source cadence when importer frame metadata is unavailable", () => {
    const presentation = createImportedClipTimelinePresentation({
      clipName: "Take",
      durationSeconds: 1,
      tracks: [
        { name: "A.position", keyTimesSeconds: [0, 1 / 30, 2 / 30] },
        { name: "B.position", keyTimesSeconds: [0, 1 / 30, 2 / 30] },
        { name: "C.position", keyTimesSeconds: [0, 1 / 120, 2 / 120] },
      ],
    });

    expect(presentation.frameRate).toBe(30);
  });
});
