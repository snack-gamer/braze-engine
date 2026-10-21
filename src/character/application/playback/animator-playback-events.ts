import { collectAnimationEvents } from "../../runtime/animation-events";
import type { LayerBlendPlan } from "../../runtime/layer-blend-plan";
import type {
  AnimatorPlaybackClip,
  AnimatorPlaybackEvent,
} from "./animator-playback-contracts";

type TrackedSample = {
  unwrappedTimeSeconds: number;
};

export type AnimatorEventStep = Readonly<{
  events: readonly AnimatorPlaybackEvent[];
  truncated: boolean;
}>;

/** Tracks compact plan samples; storage is bounded to currently active clips. */
export class AnimatorPlaybackEventTracker<TClip> {
  private samples = new Map<string, TrackedSample>();

  /** Establishes the Play-entry cursor without firing markers at time zero. */
  prime(plan: LayerBlendPlan): void {
    this.samples = samplesFromPlan(plan);
  }

  collect(
    characterId: string,
    plan: LayerBlendPlan,
    clipsById: ReadonlyMap<string, AnimatorPlaybackClip<TClip>>,
    maxEvents: number,
  ): AnimatorEventStep {
    const capacity = Math.max(0, Math.floor(maxEvents));
    const nextSamples = new Map<string, TrackedSample>();
    const output: AnimatorPlaybackEvent[] = [];
    let truncated = false;
    for (const instruction of plan.instructions) {
      for (const sample of instruction.clips) {
        const clip = clipsById.get(sample.clipId);
        if (!clip) continue;
        const key = `${instruction.layerId}\u0000${sample.sampleId}`;
        const previous = this.samples.get(key);
        const currentUnwrapped = sample.unwrappedLocalTimeSeconds;
        nextSamples.set(key, { unwrappedTimeSeconds: currentUnwrapped });
        if (!previous || clip.metadata.events.length === 0) continue;
        const remaining = capacity - output.length;
        const collected = collectAnimationEvents(
          clip.metadata.events,
          previous.unwrappedTimeSeconds,
          currentUnwrapped,
          {
            durationSeconds: sample.durationSeconds ?? clip.metadata.durationSeconds,
            looping: sample.looping ?? clip.metadata.looping,
            maxEvents: Math.max(1, remaining),
          },
        );
        const resolved = collected.fired.flatMap(({ event }) => {
          const authoredEvent = clip.metadata.events.find((candidate) => candidate.id === event.id);
          return authoredEvent ? [{
            kind: "clip" as const,
            characterId,
            layerId: instruction.layerId,
            clipId: sample.clipId,
            event: authoredEvent,
          }] : [];
        });
        if (remaining <= 0) truncated ||= resolved.length > 0 || collected.truncated;
        else output.push(...resolved.slice(0, remaining));
        truncated ||= collected.truncated || resolved.length > Math.max(0, remaining);
      }
    }
    this.samples = nextSamples;
    return { events: output, truncated };
  }

  reset(): void {
    this.samples.clear();
  }
}

function samplesFromPlan(plan: LayerBlendPlan): Map<string, TrackedSample> {
  const samples = new Map<string, TrackedSample>();
  for (const instruction of plan.instructions) {
    for (const sample of instruction.clips) {
      samples.set(`${instruction.layerId}\u0000${sample.sampleId}`, {
        unwrappedTimeSeconds: sample.unwrappedLocalTimeSeconds,
      });
    }
  }
  return samples;
}
