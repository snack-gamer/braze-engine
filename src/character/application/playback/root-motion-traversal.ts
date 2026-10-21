import type { LayerBlendPlan } from "../../runtime/layer-blend-plan";
import type { AnimatorPlaybackClip } from "./animator-playback-contracts";

export type RootMotionLoopTraversal =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "discontinuous" }>
  | Readonly<{ kind: "crossing"; cycleCrossings: number }>
  | Readonly<{ kind: "ambiguous"; reason: "blended" | "unsafeCount" }>;

const ACTIVE_WEIGHT_EPSILON = 1.0e-8;

/** Finds loop crossings only when one continuous base sample owns the root. */
export function resolveRootMotionLoopTraversal<TClip>(
  previous: LayerBlendPlan,
  current: LayerBlendPlan,
  clipsById: ReadonlyMap<string, AnimatorPlaybackClip<TClip>>,
): RootMotionLoopTraversal {
  const previousSamples = activeBaseSamples(previous);
  const currentSamples = activeBaseSamples(current);
  const previousById = new Map(previousSamples.map((sample) => [sample.sampleId, sample]));
  const continuousSamples = currentSamples.filter((sample) => (
    previousById.get(sample.sampleId)?.clipId === sample.clipId
  ));
  const crossings = currentSamples.flatMap((sample) => {
    const before = previousById.get(sample.sampleId);
    if (!before || before.clipId !== sample.clipId) return [];
    const clip = clipsById.get(sample.clipId);
    const duration = sample.durationSeconds ?? clip?.metadata.durationSeconds ?? 0;
    const looping = sample.looping ?? clip?.metadata.looping;
    if (!looping || !Number.isFinite(duration) || duration <= 0) return [];
    const cycleCrossings = Math.floor(sample.unwrappedLocalTimeSeconds / duration)
      - Math.floor(before.unwrappedLocalTimeSeconds / duration);
    return cycleCrossings === 0 ? [] : [cycleCrossings];
  });
  if (crossings.length === 0) {
    return previousSamples.length > 0 && currentSamples.length > 0 && continuousSamples.length === 0
      ? { kind: "discontinuous" }
      : { kind: "none" };
  }
  if (previousSamples.length !== 1 || currentSamples.length !== 1 || crossings.length !== 1) {
    return { kind: "ambiguous", reason: "blended" };
  }
  const cycleCrossings = crossings[0]!;
  return Number.isSafeInteger(cycleCrossings)
    ? { kind: "crossing", cycleCrossings }
    : { kind: "ambiguous", reason: "unsafeCount" };
}

function activeBaseSamples(plan: LayerBlendPlan) {
  return (plan.instructions[0]?.clips ?? []).filter((sample) => (
    Number.isFinite(sample.weight) && sample.weight > ACTIVE_WEIGHT_EPSILON
  ));
}
