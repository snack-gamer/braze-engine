import { describe, expect, it } from "vitest";
import {
  resolveProjectSectionHydration,
  resolveProjectSectionAfterSave,
  shouldHydrateBeforeProjectSectionRetry,
} from "./useProjectSectionHydration";

describe("project section hydration", () => {
  it("rebases an early local edit over independent remote material changes", () => {
    const initial = [
      { id: "metal", color: "gray", roughness: 0.5 },
      { id: "wood", color: "brown", roughness: 0.8 },
    ];
    const result = resolveProjectSectionHydration(
      "materials",
      initial,
      [initial[0], { ...initial[1], roughness: 0.9 }],
      [{ ...initial[0], color: "silver" }, initial[1]],
    );

    expect(result).toEqual({
      status: "merged",
      value: [
        { id: "metal", color: "silver", roughness: 0.5 },
        { id: "wood", color: "brown", roughness: 0.9 },
      ],
    });
  });

  it("blocks hydration when fallback and remote changed the same value", () => {
    expect(resolveProjectSectionHydration(
      "assets",
      { itemNames: { "model:a": "Original" } },
      { itemNames: { "model:a": "Local" } },
      { itemNames: { "model:a": "Remote" } },
    )).toEqual({ status: "conflict", paths: ["assets.itemNames.model:a"] });
  });

  it("never turns a pending or failed hydration retry into a write", () => {
    expect(shouldHydrateBeforeProjectSectionRetry("pending")).toBe(true);
    expect(shouldHydrateBeforeProjectSectionRetry("error")).toBe(true);
    expect(shouldHydrateBeforeProjectSectionRetry("conflict")).toBe(true);
    expect(shouldHydrateBeforeProjectSectionRetry("ready")).toBe(false);
  });

  it("adopts a returned canonical auto-merge without losing a newer local edit", () => {
    const submitted = [{ id: "metal", color: "gray", roughness: 0.5 }];
    expect(resolveProjectSectionAfterSave(
      "materials",
      submitted,
      [{ id: "metal", color: "gray", roughness: 0.7 }],
      [{ id: "metal", color: "silver", roughness: 0.5 }],
    )).toEqual({
      status: "merged",
      value: [{ id: "metal", color: "silver", roughness: 0.7 }],
    });
  });
});
