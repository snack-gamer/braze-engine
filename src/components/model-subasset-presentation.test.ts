import { describe, expect, it } from "vitest";
import {
  KNOWN_MODEL_SUBASSET_KINDS,
  modelSubAssetPresentation,
  modelSubAssetSupportsFilter,
} from "./model-subasset-presentation";

describe("model sub-asset presentation", () => {
  it("defines presentation and preview policy for every known exact kind", () => {
    expect(KNOWN_MODEL_SUBASSET_KINDS.map((kind) => modelSubAssetPresentation(kind))).toEqual([
      {
        label: "Mesh",
        icon: "assetModel",
        filters: ["all", "models"],
      },
      {
        label: "Material",
        icon: "material",
        filters: ["all", "models"],
      },
      {
        label: "Animation Clip",
        icon: "animationPlayer",
        filters: ["all", "models", "animation"],
      },
      {
        label: "Avatar",
        icon: "avatar",
        filters: ["all", "models", "animation"],
      },
      {
        label: "Skeleton",
        icon: "animator",
        filters: ["all", "models", "animation"],
      },
      {
        label: "Entity",
        icon: "object",
        filters: ["all", "models"],
      },
    ]);
  });

  it("falls back safely without inferring a kind from names or local-ID-like text", () => {
    expect(modelSubAssetPresentation("Clip")).toEqual({
      label: "Imported Item",
      icon: "object",
      filters: ["all", "models"],
    });
    expect(modelSubAssetPresentation("clip:Idle")).toBe(modelSubAssetPresentation("future-kind"));
  });

  it("centralizes Project filter membership", () => {
    expect(modelSubAssetSupportsFilter("clip", "animation")).toBe(true);
    expect(modelSubAssetSupportsFilter("avatar", "animation")).toBe(true);
    expect(modelSubAssetSupportsFilter("skeleton", "animation")).toBe(true);
    expect(modelSubAssetSupportsFilter("mesh", "animation")).toBe(false);
    expect(modelSubAssetSupportsFilter("material", "models")).toBe(true);
    expect(modelSubAssetSupportsFilter("future-kind", "all")).toBe(true);
    expect(modelSubAssetSupportsFilter("future-kind", "animation")).toBe(false);
    expect(modelSubAssetSupportsFilter("clip", "favorites")).toBe(false);
  });
});
