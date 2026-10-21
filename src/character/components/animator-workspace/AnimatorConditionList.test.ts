import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AnimatorCondition, AnimatorParameter } from "../../domain/animator-parameters";
import { AnimatorConditionList } from "./AnimatorConditionList";

function render(
  parameters: readonly AnimatorParameter[],
  conditions: readonly AnimatorCondition[],
): string {
  return renderToStaticMarkup(createElement(AnimatorConditionList, {
    parameters,
    conditions,
    onChange: () => undefined,
  }));
}

describe("AnimatorConditionList", () => {
  it("makes AND and connector-based OR semantics explicit", () => {
    const markup = render([], []);

    expect(markup).toContain("Conditions");
    expect(markup).toContain("All conditions must be true (AND)");
    expect(markup).toContain("Use another connector for OR");
    expect(markup).toContain("Create a Parameter to control this connector");
  });

  it("offers stable operators for every supported parameter type", () => {
    const floatMarkup = render(
      [{ id: "speed", name: "Speed", kind: "float", defaultValue: 0 }],
      [{ parameterId: "speed", mode: "greater", threshold: 0.2 }],
    );
    expect(floatMarkup).toContain('value="greater"');
    expect(floatMarkup).toContain('value="less"');
    expect(floatMarkup).not.toContain('value="equals"');

    const intMarkup = render(
      [{ id: "lives", name: "Lives", kind: "integer", defaultValue: 3 }],
      [{ parameterId: "lives", mode: "equals", threshold: 1 }],
    );
    expect(intMarkup).toContain('value="equals"');
    expect(intMarkup).toContain('value="notEqual"');

    const boolMarkup = render(
      [{ id: "grounded", name: "Grounded", kind: "boolean", defaultValue: true }],
      [{ parameterId: "grounded", mode: "if" }],
    );
    expect(boolMarkup).toContain("is true");
    expect(boolMarkup).toContain("is false");

    const triggerMarkup = render(
      [{ id: "jump", name: "Jump", kind: "trigger", defaultValue: false }],
      [{ parameterId: "jump", mode: "triggered" }],
    );
    expect(triggerMarkup).toContain("fires");
  });
});
