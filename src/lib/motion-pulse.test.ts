import { describe, expect, it } from "vitest";
import { parseMotionPulseComponent } from "./motion-pulse";

describe("motion pulse migration", () => {
  it("derives repeatable unique identities for legacy targets", () => {
    const legacy = {
      enabled: true,
      targets: [
        { object_id: "cube", name: "Cube" },
        { object_id: "cube", name: "Cube" },
      ],
    };
    const first = parseMotionPulseComponent(legacy)?.targets.map((target) => target.id);
    const second = parseMotionPulseComponent(legacy)?.targets.map((target) => target.id);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(2);
  });
});
