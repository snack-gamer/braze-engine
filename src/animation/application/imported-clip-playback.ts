export type ImportedClipPlaybackStep = Readonly<{
  timeSeconds: number;
  playing: boolean;
}>;

export function startImportedClipPlayback(active: boolean): ImportedClipPlaybackStep {
  return { timeSeconds: 0, playing: active };
}

export function advanceImportedClipPlayback(
  timeSeconds: number,
  deltaSeconds: number,
  durationSeconds: number,
  looping: boolean,
): ImportedClipPlaybackStep {
  const duration = Math.max(0.001, durationSeconds);
  const next = Math.max(0, timeSeconds) + Math.max(0, deltaSeconds);
  if (next < duration) return { timeSeconds: next, playing: true };
  return looping
    ? { timeSeconds: next % duration, playing: true }
    : { timeSeconds: duration, playing: false };
}
