import type * as THREE from "three";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";

export const THREE_RETARGET_WORK_LIMITS = Object.freeze({
  minimumSampleRateHz: 12,
  maximumSampleRateHz: 120,
  maximumDurationSeconds: 120,
  maximumSampleFrames: 3_600,
  maximumMappedBones: 55,
  maximumTwistHelperBones: 32,
  maximumTargetSkeletons: 8,
  maximumSourceSkeletonBones: 512,
  maximumTargetSkeletonBones: 512,
  maximumTotalTargetSkeletonBones: 1_024,
  maximumSourceTracks: 512,
  maximumSourceKeyframes: 262_144,
  maximumSourceValues: 1_048_576,
  maximumOutputSamples: 524_288,
  maximumOutputValues: 2_000_000,
  maximumOutputTypedArrayBytes: 8 * 1_024 * 1_024,
  maximumEstimatedWorkUnits: 16_000_000,
});

export type ThreeRetargetWorkload = Readonly<{
  durationSeconds: number;
  requestedSampleRateHz?: number;
  mappedBoneCount: number;
  twistHelperBoneCount?: number;
  sourceSkeletonBoneCount: number;
  targetSkeletonBoneCounts: readonly number[];
  sourceTracks: readonly Pick<THREE.KeyframeTrack, "times" | "values">[];
}>;

export type ThreeRetargetWorkPlan = Readonly<{
  sampleRateHz: number;
  sampleFrameCount: number;
  sourceKeyframeCount: number;
  sourceValueCount: number;
  predictedOutputSampleCount: number;
  predictedOutputValueCount: number;
  predictedOutputTypedArrayBytes: number;
  estimatedWorkUnits: number;
}>;

/**
 * Bounds SkeletonUtils' synchronous bake before it allocates sampled tracks.
 * Its inner lookup scans source bones for every target bone on every frame.
 */
export function assessThreeRetargetWorkload(
  workload: ThreeRetargetWorkload,
): CharacterRuntimeResult<ThreeRetargetWorkPlan> {
  const limits = THREE_RETARGET_WORK_LIMITS;
  if (!Number.isFinite(workload.durationSeconds) || workload.durationSeconds <= 0) {
    return failure("invalid-retarget-duration", "Retarget duration must be positive and finite.");
  }
  if (workload.durationSeconds > limits.maximumDurationSeconds) {
    return failure(
      "retarget-duration-limit-exceeded",
      `Retarget duration exceeds the ${limits.maximumDurationSeconds}-second synchronous bake limit.`,
    );
  }
  if (!boundedCount(workload.mappedBoneCount, 1, limits.maximumMappedBones)) {
    return failure(
      "retarget-mapped-bone-limit-exceeded",
      `Retarget mapping must contain 1-${limits.maximumMappedBones} bones.`,
    );
  }
  const twistHelperBoneCount = workload.twistHelperBoneCount ?? 0;
  if (!boundedCount(twistHelperBoneCount, 0, limits.maximumTwistHelperBones)) {
    return failure(
      "retarget-twist-helper-limit-exceeded",
      `Retargeting supports at most ${limits.maximumTwistHelperBones} twist helper bones.`,
    );
  }
  if (!boundedCount(workload.sourceSkeletonBoneCount, 1, limits.maximumSourceSkeletonBones)) {
    return failure(
      "retarget-source-skeleton-limit-exceeded",
      `Source skeleton exceeds the ${limits.maximumSourceSkeletonBones}-bone bake limit.`,
    );
  }
  const targets = workload.targetSkeletonBoneCounts;
  if (!boundedCount(targets.length, 1, limits.maximumTargetSkeletons)) {
    return failure(
      "retarget-target-skeleton-limit-exceeded",
      `Retargeting supports 1-${limits.maximumTargetSkeletons} target skeleton identities per bake.`,
    );
  }
  if (targets.some((count) => !boundedCount(count, 1, limits.maximumTargetSkeletonBones))) {
    return failure(
      "retarget-target-bone-limit-exceeded",
      `A target skeleton exceeds the ${limits.maximumTargetSkeletonBones}-bone bake limit.`,
    );
  }
  const totalTargetBones = targets.reduce((sum, count) => sum + count, 0);
  if (totalTargetBones > limits.maximumTotalTargetSkeletonBones) {
    return failure(
      "retarget-total-target-bone-limit-exceeded",
      `Target skeletons exceed the ${limits.maximumTotalTargetSkeletonBones}-bone combined bake limit.`,
    );
  }
  if (!boundedCount(workload.sourceTracks.length, 1, limits.maximumSourceTracks)) {
    return failure(
      "retarget-source-track-limit-exceeded",
      `Source animation must contain 1-${limits.maximumSourceTracks} tracks.`,
    );
  }
  const trackCounts = sourceTrackCounts(workload.sourceTracks);
  if (!trackCounts) {
    return failure(
      "invalid-retarget-source-track",
      "Every retarget source track must contain a finite, integral key/value layout.",
    );
  }
  if (trackCounts.keyframes > limits.maximumSourceKeyframes) {
    return failure(
      "retarget-source-keyframe-limit-exceeded",
      `Source animation exceeds the ${limits.maximumSourceKeyframes}-keyframe bake limit.`,
    );
  }
  if (trackCounts.values > limits.maximumSourceValues) {
    return failure(
      "retarget-source-value-limit-exceeded",
      `Source animation exceeds the ${limits.maximumSourceValues}-value bake limit.`,
    );
  }
  const sampleRateHz = safeSampleRate(workload.durationSeconds, workload.requestedSampleRateHz);
  if (!sampleRateHz) {
    return failure(
      "retarget-clip-too-short",
      `Retarget clips shorter than ${1 / 60} seconds cannot produce two bounded samples.`,
    );
  }
  const sampleFrameCount = skeletonUtilsSampleFrameCount(workload.durationSeconds, sampleRateHz);
  if (!Number.isSafeInteger(sampleFrameCount) || sampleFrameCount < 2) {
    return failure("invalid-retarget-sample-count", "Retarget sampling must produce at least two frames.");
  }
  if (sampleFrameCount > limits.maximumSampleFrames) {
    return failure(
      "retarget-sample-frame-limit-exceeded",
      `Retarget sampling exceeds the ${limits.maximumSampleFrames}-frame bake limit.`,
    );
  }
  // SkeletonUtils emits one quaternion track for every mapped target bone and
  // one position track for hips. Every track owns Float32 time/value arrays.
  // Assume every declared mapping exists on every target so preflight remains
  // conservative when a particular skin omits optional bones.
  const outputBoneCount = workload.mappedBoneCount + twistHelperBoneCount;
  const predictedOutputTrackCount = targets.length * (outputBoneCount + 1);
  const predictedOutputSampleCount = sampleFrameCount * predictedOutputTrackCount;
  if (predictedOutputSampleCount > limits.maximumOutputSamples) {
    return failure(
      "retarget-output-sample-limit-exceeded",
      `Retarget bake exceeds the ${limits.maximumOutputSamples}-sample output limit.`,
    );
  }
  const predictedOutputValueCount = sampleFrameCount * targets.length
    * (outputBoneCount * 4 + 3);
  if (predictedOutputValueCount > limits.maximumOutputValues) {
    return failure(
      "retarget-output-value-limit-exceeded",
      `Retarget bake exceeds the ${limits.maximumOutputValues}-value output limit.`,
    );
  }
  const predictedOutputTypedArrayBytes = Float32Array.BYTES_PER_ELEMENT
    * (predictedOutputSampleCount + predictedOutputValueCount);
  if (predictedOutputTypedArrayBytes > limits.maximumOutputTypedArrayBytes) {
    return failure(
      "retarget-output-byte-limit-exceeded",
      `Retarget bake exceeds the ${limits.maximumOutputTypedArrayBytes}-byte typed-array output limit.`,
    );
  }
  const setupUnits = targets.length * (trackCounts.keyframes + trackCounts.values);
  if (setupUnits > limits.maximumEstimatedWorkUnits) {
    return failure(
      "retarget-total-work-limit-exceeded",
      `Retarget bake exceeds the ${limits.maximumEstimatedWorkUnits}-unit synchronous work limit.`,
    );
  }
  // SkeletonUtils performs the linear source-name scan in both retarget() and
  // its output pass, plus target pose/capture passes and mapped-track work.
  const perFrameUnits = totalTargetBones * (2 * workload.sourceSkeletonBoneCount + 6)
    + targets.length * (workload.sourceTracks.length + outputBoneCount);
  const remainingWorkUnits = limits.maximumEstimatedWorkUnits - setupUnits;
  if (perFrameUnits > Math.floor(remainingWorkUnits / sampleFrameCount)) {
    return failure(
      "retarget-total-work-limit-exceeded",
      `Retarget bake exceeds the ${limits.maximumEstimatedWorkUnits}-unit synchronous work limit.`,
    );
  }
  return characterRuntimeSuccess({
    sampleRateHz,
    sampleFrameCount,
    sourceKeyframeCount: trackCounts.keyframes,
    sourceValueCount: trackCounts.values,
    predictedOutputSampleCount,
    predictedOutputValueCount,
    predictedOutputTypedArrayBytes,
    estimatedWorkUnits: setupUnits + perFrameUnits * sampleFrameCount,
  });
}

function safeSampleRate(durationSeconds: number, requested: number | undefined): number | null {
  const limits = THREE_RETARGET_WORK_LIMITS;
  const normalized = Math.min(limits.maximumSampleRateHz, Math.max(
    limits.minimumSampleRateHz,
    Math.round(Number.isFinite(requested) ? requested! : 30),
  ));
  const requiredForTwoFrames = 2 / durationSeconds;
  if (requiredForTwoFrames > limits.maximumSampleRateHz) return null;
  return Math.max(normalized, requiredForTwoFrames);
}

function skeletonUtilsSampleFrameCount(durationSeconds: number, sampleRateHz: number): number {
  return Math.round(durationSeconds * (sampleRateHz / 1_000) * 1_000);
}

function sourceTrackCounts(
  tracks: readonly Pick<THREE.KeyframeTrack, "times" | "values">[],
): { keyframes: number; values: number } | null {
  let keyframes = 0;
  let values = 0;
  for (const track of tracks) {
    const times = track.times.length;
    const trackValues = track.values.length;
    if (!Number.isSafeInteger(times) || times < 1 || !Number.isSafeInteger(trackValues)
      || trackValues < times || trackValues % times !== 0) return null;
    keyframes += times;
    values += trackValues;
    if (!Number.isSafeInteger(keyframes) || !Number.isSafeInteger(values)) return null;
  }
  return { keyframes, values };
}

function boundedCount(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function failure(
  code: string,
  message: string,
): CharacterRuntimeResult<ThreeRetargetWorkPlan> {
  return characterRuntimeFailure(code, message);
}
