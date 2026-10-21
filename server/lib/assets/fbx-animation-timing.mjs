const DEFAULT_FRAME_RATE = 30;
const MIN_INFERRED_FRAME_RATE = 12;
const MAX_INFERRED_FRAME_RATE = 1_000;
const FRAME_RATE_PRECISION = 1_000;

/**
 * Three's FBXLoader does not retain the FBX take's declared sample rate. Most
 * imported curves do retain its cadence, so take one vote per curve and use
 * the modal cadence. A few Euler-to-quaternion tracks contain denser generated
 * keys; voting prevents those tracks from redefining the whole take.
 */
export function inferredFbxFrameRate(clip) {
  const votes = new Map();
  for (const track of clip?.tracks ?? []) {
    const times = Array.from(track?.times ?? []);
    const deltas = [];
    for (let index = 1; index < times.length; index += 1) {
      const delta = times[index] - times[index - 1];
      if (Number.isFinite(delta) && delta > 1.0e-6) deltas.push(delta);
    }
    if (deltas.length === 0) continue;
    deltas.sort((left, right) => left - right);
    const cadence = deltas[Math.floor(deltas.length / 2)];
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

/** Publishes the source frame contract consumed by the model importer UI. */
export function fbxAnimationTiming(clip) {
  const frameRate = inferredFbxFrameRate(clip);
  const durationSeconds = Number.isFinite(clip?.duration) ? Math.max(0, clip.duration) : 0;
  return {
    frameRate,
    firstFrame: 0,
    lastFrame: Math.max(1, Math.round(durationSeconds * frameRate)),
  };
}
