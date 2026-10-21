import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HUMANOID_BONE_NAMES, type HumanBoneMapping } from "../domain/humanoid-avatar";
import { boneId } from "../domain/skeleton";
import { HumanoidMappingPanel } from "./HumanoidMappingPanel";

describe("HumanoidMappingPanel", () => {
  it("explains the role-to-model relationship and separates required readiness from total coverage", () => {
    const bones = HUMANOID_BONE_NAMES.map((name) => ({
      id: boneId(`bone:${name}`),
      name,
      path: `Armature/${name}`,
      parentId: null,
    }));
    const mapping = Object.fromEntries(
      HUMANOID_BONE_NAMES.map((name) => [name, boneId(`bone:${name}`)]),
    ) as HumanBoneMapping;
    const markup = renderToStaticMarkup(createElement(HumanoidMappingPanel, {
      bones,
      mapping,
      selectedHumanBone: null,
      onChange: () => undefined,
      onSelectBone: () => undefined,
      onAutoMap: () => undefined,
    }));

    expect(markup).toContain("15/15 required · 55/55 mapped");
    expect(markup).toContain("Humanoid role");
    expect(markup).toContain("Drop bone from Skeleton");
    expect(markup).toContain("Drag bones from Skeleton into these roles");
    expect(markup).toContain("Required for a valid Avatar");
    expect(markup).toContain("3/3 required · 6/6 mapped");
    expect(markup).toContain('data-state="mapped"');
    expect(markup).toContain("Clear Hips mapping");
    expect(markup).not.toContain('aria-haspopup="listbox"');
  });

  it("renders unassigned roles as explicit drop targets", () => {
    const markup = renderToStaticMarkup(createElement(HumanoidMappingPanel, {
      bones: [],
      mapping: {},
      selectedHumanBone: null,
      onChange: () => undefined,
      onSelectBone: () => undefined,
      onAutoMap: () => undefined,
    }));

    expect(markup).toContain('data-state="missing"');
    expect(markup).toContain("Drop bone here");
    expect(markup).toContain("Drag from Skeleton");
  });
});
