import { describe, expect, it } from "vitest";
import { animatorPreviewParameters } from "./animator-preview-parameter-store";

describe("Animator preview parameter store", () => {
  it("keeps transient values isolated by scene object and controller", () => {
    animatorPreviewParameters.set("hero-a\u0000locomotion-a", { speed: 1 });

    expect(animatorPreviewParameters.get("hero-a\u0000locomotion-a")).toEqual({ speed: 1 });
    expect(animatorPreviewParameters.get("ally-a\u0000locomotion-a") ?? {}).toEqual({});
    expect(animatorPreviewParameters.get("hero-a\u0000combat-a") ?? {}).toEqual({});
  });

  it("returns a new immutable snapshot for an updated value", () => {
    const initial = animatorPreviewParameters.get("hero-b\u0000locomotion-b") ?? {};
    const changed = { speed: 0.5 };
    animatorPreviewParameters.set("hero-b\u0000locomotion-b", changed);

    expect(changed).not.toBe(initial);
    expect(changed).toEqual({ speed: 0.5 });
  });
});
