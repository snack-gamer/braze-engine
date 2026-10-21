import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  assessThreeRetargetWorkload,
  THREE_RETARGET_WORK_LIMITS,
  type ThreeRetargetWorkload,
} from "./three-retarget-work-budget";

describe("Three retarget work budget", () => {
  it("preserves a normal humanoid clip with a deterministic work estimate", () => {
    const result = assessThreeRetargetWorkload(workload());

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual({
      sampleRateHz: 30,
      sampleFrameCount: 30,
      sourceKeyframeCount: 2,
      sourceValueCount: 8,
      predictedOutputSampleCount: 1_680,
      predictedOutputValueCount: 6_690,
      predictedOutputTypedArrayBytes: 33_480,
      estimatedWorkUnits: 6_970,
    });
  });

  it("upsamples a one-frame tiny clip to two frames and rejects an unsafe shorter clip", () => {
    const safe = assessThreeRetargetWorkload(workload({ durationSeconds: 0.02 }));
    expect(safe.value?.sampleRateHz).toBe(100);
    expect(safe.value?.sampleFrameCount).toBe(2);

    expect(code(workload({ durationSeconds: 0.01 }))).toBe("retarget-clip-too-short");
  });

  it("rejects every independent structural and source-data limit", () => {
    const limits = THREE_RETARGET_WORK_LIMITS;
    expect(code(workload({ durationSeconds: limits.maximumDurationSeconds + 1 })))
      .toBe("retarget-duration-limit-exceeded");
    expect(code(workload({ mappedBoneCount: limits.maximumMappedBones + 1 })))
      .toBe("retarget-mapped-bone-limit-exceeded");
    expect(code(workload({ sourceSkeletonBoneCount: limits.maximumSourceSkeletonBones + 1 })))
      .toBe("retarget-source-skeleton-limit-exceeded");
    expect(code(workload({
      targetSkeletonBoneCounts: Array.from({ length: limits.maximumTargetSkeletons + 1 }, () => 1),
    }))).toBe("retarget-target-skeleton-limit-exceeded");
    expect(code(workload({ targetSkeletonBoneCounts: [limits.maximumTargetSkeletonBones + 1] })))
      .toBe("retarget-target-bone-limit-exceeded");
    expect(code(workload({ targetSkeletonBoneCounts: [512, 512, 1] })))
      .toBe("retarget-total-target-bone-limit-exceeded");
    expect(code(workload({
      sourceTracks: Array.from({ length: limits.maximumSourceTracks + 1 }, () => track()),
    }))).toBe("retarget-source-track-limit-exceeded");
    expect(code(workload({ sourceTracks: [track(limits.maximumSourceKeyframes + 1, 1)] })))
      .toBe("retarget-source-keyframe-limit-exceeded");
    expect(code(workload({ sourceTracks: [track(1, limits.maximumSourceValues + 1)] })))
      .toBe("retarget-source-value-limit-exceeded");
    expect(code(workload({ sourceTracks: [track(0, 1)] })))
      .toBe("invalid-retarget-source-track");
  });

  it("rejects excessive samples and combined work below all individual limits", () => {
    expect(code(workload({ durationSeconds: 120, requestedSampleRateHz: 120 })))
      .toBe("retarget-sample-frame-limit-exceeded");
    expect(code(workload({
      durationSeconds: 120,
      requestedSampleRateHz: 30,
      sourceSkeletonBoneCount: 100,
      targetSkeletonBoneCounts: [100],
    }))).toBe("retarget-total-work-limit-exceeded");
  });

  it("rejects excessive baked samples, values, and typed-array bytes independently", () => {
    expect(code(workload({
      durationSeconds: 120,
      mappedBoneCount: 55,
      sourceSkeletonBoneCount: 1,
      targetSkeletonBoneCounts: [1, 1, 1],
    }))).toBe("retarget-output-sample-limit-exceeded");

    expect(code(workload({
      durationSeconds: 100,
      mappedBoneCount: 55,
      sourceSkeletonBoneCount: 1,
      targetSkeletonBoneCounts: [1, 1, 1],
    }))).toBe("retarget-output-value-limit-exceeded");

    expect(code(workload({
      durationSeconds: 2_800 / 30,
      mappedBoneCount: 55,
      sourceSkeletonBoneCount: 1,
      targetSkeletonBoneCounts: [1, 1, 1],
    }))).toBe("retarget-output-byte-limit-exceeded");
  });

  it("accepts the largest representable byte workload below the cap and rejects the next frame", () => {
    const targetSkeletonBoneCounts = Array.from({ length: 8 }, () => 1);
    const bounded = assessThreeRetargetWorkload(workload({
      durationSeconds: 1_197 / 30,
      mappedBoneCount: 43,
      sourceSkeletonBoneCount: 1,
      targetSkeletonBoneCounts,
    }));

    expect(bounded.value?.predictedOutputTypedArrayBytes).toBe(8_388_576);
    expect(bounded.value?.predictedOutputTypedArrayBytes)
      .toBeLessThan(THREE_RETARGET_WORK_LIMITS.maximumOutputTypedArrayBytes);
    expect(code(workload({
      durationSeconds: 1_198 / 30,
      mappedBoneCount: 43,
      sourceSkeletonBoneCount: 1,
      targetSkeletonBoneCounts,
    }))).toBe("retarget-output-byte-limit-exceeded");
  });

  it("accepts exact individual boundaries when their combined work remains safe", () => {
    const limits = THREE_RETARGET_WORK_LIMITS;
    const frameBoundary = assessThreeRetargetWorkload(workload({
      durationSeconds: limits.maximumDurationSeconds,
      requestedSampleRateHz: 30,
      mappedBoneCount: 1,
      sourceSkeletonBoneCount: 1,
      targetSkeletonBoneCounts: Array.from({ length: limits.maximumTargetSkeletons }, () => 1),
    }));
    expect(frameBoundary.value?.sampleFrameCount).toBe(limits.maximumSampleFrames);

    const dataBoundary = assessThreeRetargetWorkload(workload({
      durationSeconds: 0.02,
      sourceSkeletonBoneCount: limits.maximumSourceSkeletonBones,
      targetSkeletonBoneCounts: [
        limits.maximumTargetSkeletonBones,
        limits.maximumTargetSkeletonBones,
      ],
      sourceTracks: [track(limits.maximumSourceKeyframes, 4)],
    }));
    expect(dataBoundary.value?.sourceKeyframeCount).toBe(limits.maximumSourceKeyframes);
    expect(dataBoundary.value?.sourceValueCount).toBe(limits.maximumSourceValues);
  });
});

function workload(overrides: Partial<ThreeRetargetWorkload> = {}): ThreeRetargetWorkload {
  return {
    durationSeconds: 1,
    requestedSampleRateHz: 30,
    mappedBoneCount: 55,
    sourceSkeletonBoneCount: 8,
    targetSkeletonBoneCounts: [8],
    sourceTracks: [track()],
    ...overrides,
  };
}

function track(keyframes = 2, valuesPerKey = 4): Pick<THREE.KeyframeTrack, "times" | "values"> {
  return {
    times: { length: keyframes },
    values: { length: keyframes * valuesPerKey },
  } as unknown as Pick<THREE.KeyframeTrack, "times" | "values">;
}

function code(input: ThreeRetargetWorkload): string | undefined {
  return assessThreeRetargetWorkload(input).diagnostics[0]?.code;
}
