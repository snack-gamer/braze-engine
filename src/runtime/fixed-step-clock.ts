export type FixedStepClockOptions = {
  fixedTimestep: number;
  maxSubsteps: number;
  maxFrameDelta: number;
};

export type FixedStepBatch = {
  steps: number;
  firstStepId: number;
  lastStepId: number;
  interpolationAlpha: number;
  droppedSeconds: number;
  totalDroppedSeconds: number;
};

export type FixedStepAccumulation = {
  availableSteps: number;
  interpolationAlpha: number;
  droppedSeconds: number;
  totalDroppedSeconds: number;
};

export const DEFAULT_FIXED_STEP_OPTIONS: Readonly<FixedStepClockOptions> = {
  fixedTimestep: 1 / 60,
  maxSubsteps: 5,
  maxFrameDelta: 0.25,
};

function positiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number.`);
  }
  return value;
}

/** Converts variable render deltas into deterministic, bounded fixed steps. */
export class FixedStepClock {
  readonly fixedTimestep: number;
  readonly maxSubsteps: number;
  readonly maxFrameDelta: number;

  private accumulator = 0;
  private nextStepId = 1;
  private droppedTotal = 0;

  constructor(options: Partial<FixedStepClockOptions> = {}) {
    this.fixedTimestep = positiveFinite(
      options.fixedTimestep ?? DEFAULT_FIXED_STEP_OPTIONS.fixedTimestep,
      "fixedTimestep",
    );
    this.maxFrameDelta = positiveFinite(
      options.maxFrameDelta ?? DEFAULT_FIXED_STEP_OPTIONS.maxFrameDelta,
      "maxFrameDelta",
    );
    const maxSubsteps = options.maxSubsteps ?? DEFAULT_FIXED_STEP_OPTIONS.maxSubsteps;
    if (!Number.isInteger(maxSubsteps) || maxSubsteps <= 0) {
      throw new Error("maxSubsteps must be a positive integer.");
    }
    this.maxSubsteps = maxSubsteps;
  }

  advance(frameDeltaSeconds: number): FixedStepBatch {
    const accumulation = this.accumulate(frameDeltaSeconds);
    const batch = this.consume(this.maxSubsteps);
    return {
      ...batch,
      droppedSeconds: accumulation.droppedSeconds,
      totalDroppedSeconds: accumulation.totalDroppedSeconds,
    };
  }

  /** Adds elapsed time while bounding catch-up work and exposing discarded backlog. */
  accumulate(frameDeltaSeconds: number): FixedStepAccumulation {
    const validDelta = Number.isFinite(frameDeltaSeconds) && frameDeltaSeconds > 0
      ? frameDeltaSeconds
      : 0;
    const acceptedDelta = Math.min(validDelta, this.maxFrameDelta);
    let droppedSeconds = validDelta - acceptedDelta;
    this.accumulator += acceptedDelta;

    // A small epsilon prevents exact decimal frame cadences from losing a tick
    // to binary rounding after many frames.
    let availableSteps = this.availableSteps;
    if (availableSteps > this.maxSubsteps) {
      const droppedSteps = availableSteps - this.maxSubsteps;
      const droppedBacklog = droppedSteps * this.fixedTimestep;
      this.accumulator -= droppedBacklog;
      droppedSeconds += droppedBacklog;
      availableSteps = this.maxSubsteps;
    }
    this.accumulator = Math.max(0, this.accumulator);
    this.droppedTotal += droppedSeconds;

    return {
      availableSteps,
      interpolationAlpha: Math.min(1, this.accumulator / this.fixedTimestep),
      droppedSeconds,
      totalDroppedSeconds: this.droppedTotal,
    };
  }

  /** Consumes only steps that a backend is ready to schedule now. */
  consume(maxSteps = this.maxSubsteps): FixedStepBatch {
    const limit = Number.isFinite(maxSteps) ? Math.max(0, Math.floor(maxSteps)) : 0;
    const steps = Math.min(this.availableSteps, limit);
    this.accumulator -= steps * this.fixedTimestep;
    this.accumulator = Math.max(0, this.accumulator);

    const firstStepId = steps > 0 ? this.nextStepId : this.nextStepId - 1;
    const lastStepId = steps > 0 ? this.nextStepId + steps - 1 : this.nextStepId - 1;
    this.nextStepId += steps;
    return {
      steps,
      firstStepId,
      lastStepId,
      interpolationAlpha: Math.min(1, this.accumulator / this.fixedTimestep),
      droppedSeconds: 0,
      totalDroppedSeconds: this.droppedTotal,
    };
  }

  get availableSteps(): number {
    return Math.floor((this.accumulator + this.fixedTimestep * 1.0e-9) / this.fixedTimestep);
  }

  get interpolationAlpha(): number {
    return Math.min(1, this.accumulator / this.fixedTimestep);
  }

  stepOnce(): FixedStepBatch {
    const stepId = this.nextStepId;
    this.nextStepId += 1;
    return {
      steps: 1,
      firstStepId: stepId,
      lastStepId: stepId,
      interpolationAlpha: Math.min(1, this.accumulator / this.fixedTimestep),
      droppedSeconds: 0,
      totalDroppedSeconds: this.droppedTotal,
    };
  }

  reset(): void {
    this.accumulator = 0;
    this.nextStepId = 1;
    this.droppedTotal = 0;
  }
}
