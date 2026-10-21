import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { REQUIRED_HUMANOID_BONES, type HumanBoneMapping } from "../domain/humanoid-avatar";
import { boneId } from "../domain/skeleton";
import { HumanoidMapFigure } from "./HumanoidMapFigure";

describe("HumanoidMapFigure", () => {
  it("colors every authored Avatar Mask layer from required mapping state", () => {
    const missing = render({});
    expect(missing.match(/data-state="missing"/g)).toHaveLength(8);

    const mapping = Object.fromEntries(REQUIRED_HUMANOID_BONES.map((bone) => [bone, boneId(`bone:${bone}`)])) as HumanBoneMapping;
    const mapped = render(mapping);
    expect(mapped.match(/data-state="mapped"/g)).toHaveLength(8);
    expect(mapped).toContain('data-layer="left-hand"');
    expect(mapped).toContain('data-layer="right-leg"');
  });
});

function render(mapping: HumanBoneMapping): string {
  return renderToStaticMarkup(createElement("svg", null, createElement(HumanoidMapFigure, { mapping })));
}
