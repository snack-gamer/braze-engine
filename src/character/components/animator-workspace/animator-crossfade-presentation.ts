import type { AnimatorTransition } from "../../domain/animator-controller";

export type AnimatorCrossfadeTimeline = Readonly<{
  fadeStartPercent: number;
  fadeEndPercent: number;
  editPointPercent: number;
  sourceCyclePercent: number;
  durationNormalized: number;
  timelineEndNormalized: number;
}>;

export type AnimatorCrossfadeDragTarget = "source" | "crossfade" | "destination";

export type AnimatorClipTimeTick = Readonly<{
  positionPercent: number;
  cycleBoundary: boolean;
  label?: string;
}>;

/** Builds quarter-cycle marks for a Clip, shifted by its normalized start offset. */
export function animatorClipTimeTicks(offsetNormalized: number): readonly AnimatorClipTimeTick[] {
  const offset = nonNegativeFinite(offsetNormalized);
  const firstQuarter = Math.ceil((offset - 1.0e-8) * 4) / 4;
  const ticks: AnimatorClipTimeTick[] = [];
  for (let value = firstQuarter; value <= offset + 1 + 1.0e-8; value += 0.25) {
    const rounded = Math.round(value);
    const cycleBoundary = Math.abs(value - rounded) < 1.0e-8;
    ticks.push({
      positionPercent: Math.max(0, Math.min(100, (value - offset) * 100)),
      cycleBoundary,
      ...(cycleBoundary ? { label: `${rounded}×` } : {}),
    });
  }
  return ticks;
}

/** Places the runtime transition sample inside its authored crossfade window. */
export function animatorCrossfadePlaybackPercent(
  timeline: AnimatorCrossfadeTimeline,
  progress: number,
): number {
  const bounded = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return timeline.fadeStartPercent
    + (timeline.fadeEndPercent - timeline.fadeStartPercent) * bounded;
}

/** Projects authored transition timing into the compact Inspector timeline. */
export function animatorCrossfadeTimeline(
  transition: AnimatorTransition,
  sourceDurationSeconds?: number,
  viewportEndNormalized?: number,
): AnimatorCrossfadeTimeline {
  const durationNormalized = normalizedDuration(transition, sourceDurationSeconds);
  const fadeStart = transition.hasExitTime
    ? nonNegativeFinite(transition.exitTimeNormalized)
    : 0;
  const fadeEnd = fadeStart + durationNormalized;
  const timelineEndNormalized = positiveFinite(viewportEndNormalized)
    ?? Math.max(1, fadeEnd + 0.25);
  return {
    fadeStartPercent: percentage(fadeStart, timelineEndNormalized),
    fadeEndPercent: percentage(fadeEnd, timelineEndNormalized),
    editPointPercent: percentage((fadeStart + fadeEnd) / 2, timelineEndNormalized),
    sourceCyclePercent: percentage(1, timelineEndNormalized),
    durationNormalized,
    timelineEndNormalized,
  };
}

/** Maps one horizontal timeline gesture back to the authored transition field it owns. */
export function animatorCrossfadeDragPatch(
  transition: AnimatorTransition,
  target: AnimatorCrossfadeDragTarget,
  deltaNormalized: number,
  sourceDurationSeconds?: number,
): Partial<Omit<AnimatorTransition, "id" | "destination">> {
  const delta = Number.isFinite(deltaNormalized) ? deltaNormalized : 0;
  if (target === "source") {
    if (!transition.hasExitTime) return {};
    const fadeEnd = transition.exitTimeNormalized
      + normalizedDuration(transition, sourceDurationSeconds);
    const exitTimeNormalized = Math.max(
      0,
      Math.min(fadeEnd, transition.exitTimeNormalized + delta),
    );
    return {
      exitTimeNormalized,
      duration: authoredDuration(
        fadeEnd - exitTimeNormalized,
        transition.durationMode,
        sourceDurationSeconds,
      ),
    };
  }
  if (target === "destination") {
    const durationNormalized = Math.max(
      0,
      normalizedDuration(transition, sourceDurationSeconds) + delta,
    );
    return {
      duration: authoredDuration(
        durationNormalized,
        transition.durationMode,
        sourceDurationSeconds,
      ),
    };
  }
  if (target === "crossfade") {
    return transition.hasExitTime
      ? { exitTimeNormalized: Math.max(0, transition.exitTimeNormalized + delta) }
      : {};
  }
  return {};
}

function percentage(value: number, total: number): number {
  return Math.max(0, Math.min(100, value / total * 100));
}

function nonNegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function positiveFinite(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizedDuration(
  transition: AnimatorTransition,
  sourceDurationSeconds?: number,
): number {
  const duration = nonNegativeFinite(transition.duration);
  if (transition.durationMode === "normalized") return duration;
  return duration / (positiveFinite(sourceDurationSeconds) ?? 1);
}

function authoredDuration(
  normalized: number,
  mode: AnimatorTransition["durationMode"],
  sourceDurationSeconds?: number,
): number {
  return mode === "seconds"
    ? normalized * (positiveFinite(sourceDurationSeconds) ?? 1)
    : normalized;
}
