import { describe, expect, it } from "vitest";
import { PhysicsStepDurationEstimator } from "./step-duration-estimator";

describe("PhysicsStepDurationEstimator", () => {
  it("reports a smoothed per-step queue completion duration", () => {
    const estimate = new PhysicsStepDurationEstimator({
      initialStepMilliseconds: 8,
      smoothing: 0.5,
    });
    estimate.recordBatch(20, 2);
    expect(estimate.stepMilliseconds).toBe(9);
    estimate.recordBatch(8, 2);
    expect(estimate.stepMilliseconds).toBe(6.5);
  });

  it("ignores invalid samples and validates configuration", () => {
    const estimate = new PhysicsStepDurationEstimator({
      initialStepMilliseconds: 8,
      smoothing: 1,
    });
    estimate.recordBatch(Number.NaN, 1);
    estimate.recordBatch(4, 0);
    expect(estimate.stepMilliseconds).toBe(8);
    expect(() => new PhysicsStepDurationEstimator({
      initialStepMilliseconds: 0,
      smoothing: 1,
    })).toThrow(/initialStepMilliseconds/);
    expect(() => new PhysicsStepDurationEstimator({
      initialStepMilliseconds: 8,
      smoothing: 0,
    })).toThrow(/smoothing/);
  });
});
