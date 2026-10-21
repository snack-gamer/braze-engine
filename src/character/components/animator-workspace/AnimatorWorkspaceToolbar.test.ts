import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createAnimatorController,
  type AnimatorStateMachine,
} from "../../domain/animator-controller";
import { AnimatorWorkspaceToolbar } from "./AnimatorWorkspaceToolbar";

function machine(
  id: string,
  name: string,
  stateMachines: AnimatorStateMachine[] = [],
): AnimatorStateMachine {
  return {
    id,
    name,
    defaultStateId: "",
    states: [],
    stateMachines,
    anyStateTransitions: [],
    transitions: [],
  };
}

describe("AnimatorWorkspaceToolbar", () => {
  it("extends the breadcrumb into an isolated Blend Tree", () => {
    const controller = createAnimatorController("controller");
    const layer = controller.layers[0]!;
    const markup = renderToStaticMarkup(createElement(AnimatorWorkspaceToolbar, {
      controller,
      layer,
      stateMachinePath: [],
      blendTreeName: "Locomotion",
      onChange: () => {},
      onNavigateStateMachine: () => {},
    }));

    expect(markup.indexOf("Base Layer")).toBeLessThan(markup.indexOf("Locomotion"));
    expect(markup).toContain('<button type="button" aria-current="page">Locomotion</button>');
    expect(markup).toContain("0 states");
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("renders an accessible root-to-current state-machine breadcrumb", () => {
    const airborne = machine("airborne", "Airborne");
    const locomotion = machine("locomotion", "Locomotion", [airborne]);
    const source = createAnimatorController("controller");
    const layer = {
      ...source.layers[0]!,
      stateMachines: [locomotion],
    };
    const controller = { ...source, layers: [layer] };

    const markup = renderToStaticMarkup(createElement(AnimatorWorkspaceToolbar, {
      controller,
      layer,
      stateMachinePath: [locomotion, airborne],
      onChange: () => {},
      onNavigateStateMachine: () => {},
    }));

    expect(markup).toContain('<nav aria-label="Animator state machine path">');
    expect(markup.indexOf("Base Layer")).toBeLessThan(markup.indexOf("Locomotion"));
    expect(markup.indexOf("Locomotion")).toBeLessThan(markup.indexOf("Airborne"));
    expect(markup).toContain('<button type="button" aria-current="page">Airborne</button>');
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toContain("0 states · 0 nested machines · 0 transitions");
  });

  it("reports child machines instead of describing every state as a Clip", () => {
    const child = machine("airborne", "Airborne");
    const locomotion = machine("locomotion", "Locomotion", [child]);
    const source = createAnimatorController("controller");
    const layer = { ...source.layers[0]!, stateMachines: [locomotion] };
    const controller = { ...source, layers: [layer] };

    const markup = renderToStaticMarkup(createElement(AnimatorWorkspaceToolbar, {
      controller,
      layer,
      stateMachinePath: [locomotion],
      onChange: () => {},
      onNavigateStateMachine: () => {},
    }));

    expect(markup).toContain("0 states · 1 nested machine · 0 transitions");
    expect(markup).not.toContain("clips");
    expect(markup).not.toContain("issue");
  });
});
