import { describe, expect, it } from "vitest";
import { evaluateDirectBlendTree } from "./blend-tree-direct";

describe("Direct blend-tree weights", () => {
  it("preserves raw positive parameter weights in authored order", () => {
    expect(evaluateDirectBlendTree([
      { motionId: "face", weight: 2 },
      { motionId: "eyes", weight: 0.25 },
    ], false).value).toEqual([
      { motionId: "face", weight: 2 },
      { motionId: "eyes", weight: 0.25 },
    ]);
  });

  it("normalizes deterministically and reports an all-zero layout", () => {
    expect(evaluateDirectBlendTree([
      { motionId: "left", weight: 1 },
      { motionId: "right", weight: 3 },
    ], true).value).toEqual([
      { motionId: "left", weight: 0.25 },
      { motionId: "right", weight: 0.75 },
    ]);
    const zero = evaluateDirectBlendTree([
      { motionId: "left", weight: 0 },
      { motionId: "right", weight: 0 },
    ], true);
    expect(zero.value).toEqual([]);
    expect(zero.diagnostics.map((item) => item.code)).toEqual(["zero-direct-blend-weight-sum"]);
  });

  it("fails invalid weights and duplicate IDs explicitly", () => {
    expect(evaluateDirectBlendTree([{ motionId: "bad", weight: -1 }], false).diagnostics[0]?.code)
      .toBe("invalid-direct-blend-weight");
    expect(evaluateDirectBlendTree([
      { motionId: "same", weight: 1 },
      { motionId: "same", weight: 2 },
    ], false).diagnostics[0]?.code).toBe("duplicate-blend-child-id");
  });
});
