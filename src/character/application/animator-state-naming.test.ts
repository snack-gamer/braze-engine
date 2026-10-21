import { describe, expect, it } from "vitest";
import { uniqueAnimatorStateName } from "./animator-state-naming";

describe("Animator state naming", () => {
  it("fills the first available readable suffix without creating collisions", () => {
    const states = [{ name: "Idle" }, { name: "Idle 2" }, { name: "Idle 4" }];
    expect(uniqueAnimatorStateName(states, "Idle")).toBe("Idle 3");
    expect(uniqueAnimatorStateName(states, " Run ")).toBe("Run");
    expect(uniqueAnimatorStateName(states, "", "Clip 4")).toBe("Clip 4");
  });
});
