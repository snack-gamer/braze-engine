import type { AnimatorComponent } from "../../domain/animator-component";
import { FixedStepClock } from "../../../runtime/fixed-step-clock";

export type AnimatorCadenceBatch = Readonly<{
  stepDeltas: readonly number[];
  droppedSeconds: number;
}>;

type AnimatorCadenceOptions = Readonly<{
  fixedStepSeconds: number;
  maxFixedStepsPerFrame: number;
  maxFrameDeltaSeconds?: number;
}>;

/** Turns a shared frame delta into bounded Animator steps without owning a clock. */
export class AnimatorPlaybackCadence {
  private readonly clock: FixedStepClock;

  constructor(options: AnimatorCadenceOptions) {
    this.clock = new FixedStepClock({
      fixedTimestep: positive(options.fixedStepSeconds, 1 / 60),
      maxSubsteps: positiveInteger(options.maxFixedStepsPerFrame, 5),
      maxFrameDelta: positive(options.maxFrameDeltaSeconds ?? 0.25, 0.25),
    });
  }

  steps(
    mode: AnimatorComponent["updateMode"],
    deltaSeconds: number,
    unscaledDeltaSeconds = deltaSeconds,
  ): AnimatorCadenceBatch {
    const requested = safeDelta(mode === "unscaledTime" ? unscaledDeltaSeconds : deltaSeconds);
    const accepted = Math.min(requested, this.clock.maxFrameDelta);
    let droppedSeconds = requested - accepted;
    if (mode !== "fixedStep") {
      this.clock.reset();
      return { stepDeltas: accepted > 0 ? [accepted] : [], droppedSeconds };
    }
    const batch = this.clock.advance(requested);
    droppedSeconds = batch.droppedSeconds;
    return {
      stepDeltas: Array.from({ length: batch.steps }, () => this.clock.fixedTimestep),
      droppedSeconds,
    };
  }

  reset(): void {
    this.clock.reset();
  }
}

function safeDelta(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
