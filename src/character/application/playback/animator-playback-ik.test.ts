import { describe, expect, it } from "vitest";
import { createAnimatorIkGoalStore } from "./animator-playback-ik";

describe("Animator IK goal store", () => {
  it("owns cloned runtime goals per character, layer, and limb", () => {
    const store = createAnimatorIkGoalStore();
    const position: [number, number, number] = [1, 2, 3];
    const result = store.commands.setGoal("hero", "base", {
      goal: "leftFoot",
      position,
      positionWeight: 1,
      rotationWeight: 0,
    });
    position[0] = 99;

    expect(result.diagnostics).toEqual([]);
    expect(store.goals("hero", "base")[0]?.position).toEqual([1, 2, 3]);
    store.commands.clearGoal("hero", "base", "leftFoot");
    expect(store.goals("hero", "base")).toEqual([]);
  });

  it("rejects non-finite goals and out-of-range weights", () => {
    const store = createAnimatorIkGoalStore();
    const result = store.commands.setGoal("hero", "base", {
      goal: "rightHand",
      position: [Number.NaN, 0, 0],
      positionWeight: 2,
      rotationWeight: 0,
    });
    expect(result.value).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("invalid-animator-ik-goal");
  });
});
