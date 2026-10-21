import { describe, expect, it } from "vitest";
import type { MotionPulseTarget } from "../domain/motion-pulse";
import {
  assignMotionPulseTarget,
  changeMotionPulseAxisMode,
  patchMotionPulseTarget,
  patchMotionPulseVectorAxis,
  removeMotionPulseTarget,
} from "./motion-pulse-targets";

const target = (id: string): MotionPulseTarget => ({
  id, name: id, enabled: true, mode: "loop", axisMode: "individual",
  rate: 1, phase: 0, easing: "linear",
  position: [1, 2, 3], rotation: [4, 5, 6], scale: [7, 8, 9],
});

describe("motion pulse target authoring", () => {
  it("patches, removes, and assigns one target without reordering siblings", () => {
    const targets = [target("a"), target("b")];
    expect(patchMotionPulseTarget(targets, "b", { rate: 2 })).toEqual([targets[0], { ...targets[1], rate: 2 }]);
    expect(assignMotionPulseTarget(targets, "a", { id: "object", name: "" })[0]).toMatchObject({
      id: "a", objectId: "object", name: "object",
    });
    expect(removeMotionPulseTarget(targets, "a")).toEqual([targets[1]]);
  });

  it("normalizes all vectors when axes become unified", () => {
    const changed = changeMotionPulseAxisMode([target("a")], "a", "unified")[0];
    expect(changed).toMatchObject({
      axisMode: "unified", position: [1, 1, 1], rotation: [4, 4, 4], scale: [7, 7, 7],
    });
    expect(patchMotionPulseVectorAxis([1, 2, 3], 2, 8, "individual")).toEqual([1, 2, 8]);
    expect(patchMotionPulseVectorAxis([1, 2, 3], 0, 8, "unified")).toEqual([8, 8, 8]);
  });
});
