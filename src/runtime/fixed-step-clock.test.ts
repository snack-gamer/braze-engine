import { describe, expect, it } from "vitest";
import { FixedStepClock } from "./fixed-step-clock";

function simulateRenderCadence(renderHz: number, seconds: number): number {
  const clock = new FixedStepClock();
  let steps = 0;
  for (let frame = 0; frame < renderHz * seconds; frame += 1) {
    steps += clock.advance(1 / renderHz).steps;
  }
  return steps;
}

describe("FixedStepClock", () => {
  it("produces the same simulated ticks at 30, 60, and 120 render Hz", () => {
    expect(simulateRenderCadence(30, 2)).toBe(120);
    expect(simulateRenderCadence(60, 2)).toBe(120);
    expect(simulateRenderCadence(120, 2)).toBe(120);
  });

  it("advances exactly one tick for an explicit Step", () => {
    const clock = new FixedStepClock();
    expect(clock.stepOnce()).toMatchObject({ steps: 1, firstStepId: 1, lastStepId: 1 });
    expect(clock.stepOnce()).toMatchObject({ steps: 1, firstStepId: 2, lastStepId: 2 });
  });

  it("bounds catch-up work and reports discarded time", () => {
    const clock = new FixedStepClock({ fixedTimestep: 1 / 60, maxSubsteps: 5, maxFrameDelta: 0.25 });
    const batch = clock.advance(1);
    expect(batch.steps).toBe(5);
    expect(batch.droppedSeconds).toBeCloseTo(55 / 60, 8);
    expect(batch.totalDroppedSeconds).toBeCloseTo(batch.droppedSeconds, 12);
  });

  it("bounds accumulated work while an asynchronous backend is busy", () => {
    const clock = new FixedStepClock({ fixedTimestep: 1 / 60, maxSubsteps: 5 });
    const accumulation = clock.accumulate(1);

    expect(accumulation.availableSteps).toBe(5);
    expect(accumulation.droppedSeconds).toBeCloseTo(55 / 60, 8);
    expect(clock.consume(1)).toMatchObject({ steps: 1, firstStepId: 1, lastStepId: 1 });
    expect(clock.availableSteps).toBe(4);
    expect(clock.consume(2)).toMatchObject({ steps: 2, firstStepId: 2, lastStepId: 3 });
    expect(clock.availableSteps).toBe(2);
  });

  it("ignores invalid frame deltas", () => {
    const clock = new FixedStepClock();
    expect(clock.advance(Number.NaN).steps).toBe(0);
    expect(clock.advance(-1).steps).toBe(0);
  });

  it("rejects invalid timing configuration", () => {
    expect(() => new FixedStepClock({ fixedTimestep: 0 })).toThrow(/fixedTimestep/);
    expect(() => new FixedStepClock({ maxSubsteps: 1.5 })).toThrow(/maxSubsteps/);
  });
});
