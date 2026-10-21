export type PhysicsStepDurationEstimatorOptions = Readonly<{
  initialStepMilliseconds: number;
  smoothing: number;
}>;

/** Smooths queue-completion duration for diagnostics without controlling admission. */
export class PhysicsStepDurationEstimator {
  private estimate: number;
  readonly smoothing: number;

  constructor(options: PhysicsStepDurationEstimatorOptions) {
    this.estimate = positive(options.initialStepMilliseconds, "initialStepMilliseconds");
    if (!Number.isFinite(options.smoothing) || options.smoothing <= 0 || options.smoothing > 1) {
      throw new Error("smoothing must be in the range (0, 1].");
    }
    this.smoothing = options.smoothing;
  }

  recordBatch(durationMilliseconds: number, steps: number): void {
    if (!Number.isFinite(durationMilliseconds) || durationMilliseconds < 0 || steps <= 0) return;
    const perStep = Math.max(0.001, durationMilliseconds / steps);
    this.estimate += (perStep - this.estimate) * this.smoothing;
  }

  get stepMilliseconds(): number {
    return this.estimate;
  }
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number.`);
  }
  return value;
}
