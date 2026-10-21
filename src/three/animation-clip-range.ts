import * as THREE from "three";

const DEFAULT_FRAME_RATE = 30;
const MIN_INFERRED_FRAME_RATE = 12;
const MAX_INFERRED_FRAME_RATE = 1_000;
const FRAME_RATE_PRECISION = 1_000;
const TIME_EPSILON = 1.0e-7;

/** Infers the source cadence lost by Three's FBXLoader using one vote per curve. */
export function inferredAnimationClipFrameRate(clip: THREE.AnimationClip): number {
  const votes = new Map<number, number>();
  for (const track of clip.tracks) {
    const deltas: number[] = [];
    for (let index = 1; index < track.times.length; index += 1) {
      const delta = track.times[index]! - track.times[index - 1]!;
      if (Number.isFinite(delta) && delta > 1.0e-6) deltas.push(delta);
    }
    if (deltas.length === 0) continue;
    deltas.sort((left, right) => left - right);
    const cadence = deltas[Math.floor(deltas.length / 2)]!;
    const frameRate = 1 / cadence;
    if (frameRate < MIN_INFERRED_FRAME_RATE || frameRate > MAX_INFERRED_FRAME_RATE) continue;
    const rounded = Math.round(frameRate * FRAME_RATE_PRECISION) / FRAME_RATE_PRECISION;
    votes.set(rounded, (votes.get(rounded) ?? 0) + 1);
  }
  return [...votes.entries()].sort((left, right) => (
    right[1] - left[1]
    || Math.abs(left[0] - DEFAULT_FRAME_RATE) - Math.abs(right[0] - DEFAULT_FRAME_RATE)
    || left[0] - right[0]
  ))[0]?.[0] ?? DEFAULT_FRAME_RATE;
}

export type AnimationClipFrameRange = Readonly<{
  firstFrame: number;
  lastFrame: number;
}>;

export type TrimmedAnimationClip = Readonly<{
  clip: THREE.AnimationClip;
  changed: boolean;
  firstFrame: number;
  lastFrame: number;
  frameRate: number;
}>;

/**
 * Trims an inclusive frame range and samples exact boundary values. Three's
 * AnimationUtils.subclip drops boundaries that are not authored keys, which
 * makes edited FBX ranges pop; importer ranges must interpolate them instead.
 */
export function trimAnimationClipToFrames(
  source: THREE.AnimationClip,
  range: AnimationClipFrameRange,
): TrimmedAnimationClip | null {
  const frameRate = inferredAnimationClipFrameRate(source);
  const sourceLastFrame = Math.max(1, Math.round(source.duration * frameRate));
  const firstFrame = Math.min(sourceLastFrame, Math.max(0, range.firstFrame));
  const lastFrame = Math.min(sourceLastFrame, Math.max(0, range.lastFrame));
  if (!Number.isFinite(firstFrame) || !Number.isFinite(lastFrame) || lastFrame <= firstFrame) {
    return null;
  }
  const changed = Math.abs(firstFrame) > TIME_EPSILON
    || Math.abs(lastFrame - sourceLastFrame) > TIME_EPSILON;
  if (!changed) return { clip: source, changed: false, firstFrame, lastFrame, frameRate };
  const firstTime = firstFrame / frameRate;
  const lastTime = lastFrame / frameRate;
  const tracks = source.tracks.map((track) => trimTrack(track, firstTime, lastTime));
  const clip = new THREE.AnimationClip(source.name, lastTime - firstTime, tracks, source.blendMode);
  return { clip, changed: true, firstFrame, lastFrame, frameRate };
}

function trimTrack(
  source: THREE.KeyframeTrack,
  firstTime: number,
  lastTime: number,
): THREE.KeyframeTrack {
  const valueSize = source.getValueSize();
  const interpolant = trackInterpolant(source);
  const times: number[] = [0];
  const values: Array<number | string | boolean> = Array.from(
    interpolant.evaluate(firstTime) as ArrayLike<number | string | boolean>,
  );
  for (let index = 0; index < source.times.length; index += 1) {
    const time = source.times[index]!;
    if (time <= firstTime + TIME_EPSILON || time >= lastTime - TIME_EPSILON) continue;
    times.push(time - firstTime);
    for (let offset = 0; offset < valueSize; offset += 1) {
      values.push(source.values[index * valueSize + offset]!);
    }
  }
  times.push(lastTime - firstTime);
  values.push(...Array.from(
    interpolant.evaluate(lastTime) as ArrayLike<number | string | boolean>,
  ));
  const TrackConstructor = source.constructor as typeof THREE.KeyframeTrack;
  return new TrackConstructor(source.name, times, values, source.getInterpolation());
}

function trackInterpolant(track: THREE.KeyframeTrack): THREE.Interpolant {
  switch (track.getInterpolation()) {
    case THREE.InterpolateDiscrete:
      return track.InterpolantFactoryMethodDiscrete();
    case THREE.InterpolateSmooth:
      return track.InterpolantFactoryMethodSmooth();
    case THREE.InterpolateBezier:
      return track.InterpolantFactoryMethodBezier();
    default:
      return track.InterpolantFactoryMethodLinear();
  }
}
