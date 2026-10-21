import * as THREE from "three";

const unconditionedClips = new WeakMap<THREE.AnimationClip, THREE.AnimationClip>();

/** Distributes endpoint pose deltas across the transform curves of an importer-owned clip. */
export function applyAnimationClipLoopPose(clip: THREE.AnimationClip): void {
  if (!unconditionedClips.has(clip)) unconditionedClips.set(clip, clip.clone());
  clip.tracks.forEach(loopPoseTrack);
}

/** Returns the authored curve data retained for root-motion extraction. */
export function animationClipForRootMotionExtraction(
  clip: THREE.AnimationClip,
): THREE.AnimationClip {
  return unconditionedClips.get(clip) ?? clip;
}

/** Clones a processed clip together with its importer-owned root-motion source. */
export function cloneAnimationClipWithRootMotionSource(
  clip: THREE.AnimationClip,
): THREE.AnimationClip {
  const clone = clip.clone();
  const unconditioned = unconditionedClips.get(clip);
  if (unconditioned) unconditionedClips.set(clone, unconditioned.clone());
  return clone;
}

function loopPoseTrack(track: THREE.KeyframeTrack): void {
  const keyCount = track.times.length;
  if (keyCount < 2 || track.getInterpolation() === THREE.InterpolateDiscrete) return;
  const firstTime = track.times[0]!;
  const span = track.times[keyCount - 1]! - firstTime;
  if (!(span > 0)) return;
  if (track.name.endsWith(".position") && track.getValueSize() === 3) {
    distributeVectorDelta(track, firstTime, span);
  } else if (track.name.endsWith(".quaternion") && track.getValueSize() === 4) {
    distributeQuaternionDelta(track, firstTime, span);
  }
}

function distributeVectorDelta(track: THREE.KeyframeTrack, firstTime: number, span: number): void {
  const lastOffset = track.values.length - 3;
  const delta = [0, 1, 2].map((axis) => track.values[axis]! - track.values[lastOffset + axis]!);
  for (let key = 1; key < track.times.length; key += 1) {
    const phase = (track.times[key]! - firstTime) / span;
    for (let axis = 0; axis < 3; axis += 1) {
      track.values[key * 3 + axis] += delta[axis]! * phase;
    }
  }
}

function distributeQuaternionDelta(track: THREE.KeyframeTrack, firstTime: number, span: number): void {
  const lastOffset = track.values.length - 4;
  const start = new THREE.Quaternion().fromArray(track.values, 0).normalize();
  const end = new THREE.Quaternion().fromArray(track.values, lastOffset).normalize();
  if (start.dot(end) < 0) end.set(-end.x, -end.y, -end.z, -end.w);
  const delta = end.clone().invert().multiply(start).normalize();
  const identity = new THREE.Quaternion();
  const value = new THREE.Quaternion();
  const correction = new THREE.Quaternion();
  for (let key = 1; key < track.times.length; key += 1) {
    const phase = (track.times[key]! - firstTime) / span;
    value.fromArray(track.values, key * 4).normalize()
      .multiply(correction.slerpQuaternions(identity, delta, phase)).normalize()
      .toArray(track.values, key * 4);
  }
  for (let axis = 0; axis < 4; axis += 1) track.values[lastOffset + axis] = track.values[axis]!;
}
