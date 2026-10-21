import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { boneId } from "../domain/skeleton";
import { SkeletonHierarchyPanel } from "./SkeletonHierarchyPanel";

describe("SkeletonHierarchyPanel", () => {
  it("exposes source bones as draggable assignment items and marks mapped sources", () => {
    const hips = boneId("bone:hips");
    const spine = boneId("bone:spine");
    const markup = renderToStaticMarkup(createElement(SkeletonHierarchyPanel, {
      bones: [
        { id: hips, name: "Hips", path: "Hips", parentId: null },
        { id: spine, name: "Spine", path: "Hips/Spine", parentId: hips },
      ],
      mapping: { hips },
      dragEnabled: true,
      selectedBoneId: null,
      onSelectBone: () => undefined,
    }));

    expect(markup).toContain("2 bones · Drag to assign");
    expect(markup.match(/draggable="true"/g)).toHaveLength(2);
    expect(markup).toContain('data-state="mapped"');
    expect(markup).toContain('data-state="unmapped"');
    expect(markup).toContain("Hips");
  });
});
