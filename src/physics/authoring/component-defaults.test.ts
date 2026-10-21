import { describe, expect, it } from "vitest";
import { normalizeCollider } from "./component-defaults";

describe("physics component defaults", () => {
  it("normalizes legacy capsules to the engine's X-axis convention", () => {
    const collider = normalizeCollider({
      id: "legacy-capsule",
      shape: "capsule",
    });

    expect(collider.axis).toBe("x");
  });

  it("does not add an irrelevant axis to non-capsule shapes", () => {
    expect(normalizeCollider({ id: "box", shape: "box" }).axis).toBeUndefined();
  });
});
