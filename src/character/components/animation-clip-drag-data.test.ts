import { describe, expect, it } from "vitest";
import {
  ANIMATION_CLIP_DRAG_TYPE,
  hasAnimationClipDrag,
  readAnimationClipDrag,
  writeAnimationClipDrag,
} from "./animation-clip-drag-data";

function dataTransfer() {
  const values = new Map<string, string>();
  return {
    transfer: {
      effectAllowed: "none",
      get types() { return [...values.keys()]; },
      getData: (type: string) => values.get(type) ?? "",
      setData: (type: string, value: string) => { values.set(type, value); },
    } as unknown as DataTransfer,
    values,
  };
}

describe("Animation Clip drag data", () => {
  it("round-trips a durable imported Clip reference", () => {
    const { transfer, values } = dataTransfer();
    writeAnimationClipDrag(transfer, {
      clipRef: { guid: "A".repeat(32), localId: "clip:idle" },
      name: "Idle",
    });

    expect(hasAnimationClipDrag(transfer)).toBe(true);
    expect(transfer.effectAllowed).toBe("copy");
    expect(values.get("text/plain")).toBe("Idle");
    expect(readAnimationClipDrag(transfer)).toEqual({
      clipRef: { guid: "a".repeat(32), localId: "clip:idle" },
      name: "Idle",
    });
  });

  it("rejects malformed identities and incomplete Clip payloads", () => {
    const transfer = {
      types: [ANIMATION_CLIP_DRAG_TYPE],
      getData: () => JSON.stringify({ clipRef: { guid: "not-a-guid" }, name: "Idle" }),
    } as unknown as DataTransfer;
    expect(readAnimationClipDrag(transfer)).toBeNull();
  });
});
