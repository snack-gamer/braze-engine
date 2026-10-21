import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AnimatorGraphEdge, AnimatorGraphNode } from "../../application/animator-graph-model";
import type { AnimatorTransition } from "../../domain/animator-controller";
import type { AnimatorParameter } from "../../domain/animator-parameters";
import { AnimatorGraphConnections } from "./AnimatorGraphConnections";

const NODES: readonly AnimatorGraphNode[] = [{
  id: "state:idle",
  kind: "state",
  label: "Idle",
  subtitle: "Clip",
  x: 10,
  y: 20,
  stateId: "idle",
  defaultState: true,
}, {
  id: "state:run",
  kind: "state",
  label: "Run",
  subtitle: "Clip",
  x: 320,
  y: 120,
  stateId: "run",
  defaultState: false,
}];

const PARAMETERS: readonly AnimatorParameter[] = [
  { id: "speed", name: "Speed", kind: "float", defaultValue: 0 },
  { id: "steps", name: "Steps", kind: "integer", defaultValue: 0 },
  { id: "grounded", name: "Grounded", kind: "boolean", defaultValue: false },
  { id: "jump", name: "Jump", kind: "trigger", defaultValue: false },
];

function render(conditions: AnimatorTransition["conditions"]): string {
  const transition: AnimatorTransition = {
    id: "idle-run",
    destination: { kind: "state", stateId: "run" },
    conditions,
    hasExitTime: true,
    exitTimeNormalized: 0.75,
    durationMode: "normalized",
    duration: 0.25,
    offsetNormalized: 0,
    interruptionSource: "none",
    orderedInterruption: true,
    canTransitionToSelf: false,
  };
  const edges: readonly AnimatorGraphEdge[] = [{
    id: transition.id,
    kind: "transition",
    sourceNodeId: "state:idle",
    destinationNodeId: "state:run",
    source: { kind: "state", stateId: "idle" },
    transition,
  }];
  return renderToStaticMarkup(createElement(AnimatorGraphConnections, {
    nodes: NODES,
    edges,
    parameters: PARAMETERS,
    width: 600,
    height: 300,
    activeTransitionIds: new Set<string>(),
    transitionProgressById: new Map<string, number>(),
    onSelect: () => undefined,
  }));
}

describe("AnimatorGraphConnections", () => {
  it("shows a compact condition count on conditional connectors", () => {
    const markup = render([
      { parameterId: "speed", mode: "greater", threshold: 0.2 },
      { parameterId: "grounded", mode: "if" },
    ]);

    expect(markup).toContain('data-condition-count="2"');
    expect(markup).toContain('data-parameter-types="F B"');
    expect(markup).toContain("F B · 2");
    expect(markup).toContain('<text x="0.75" y="0.5" text-anchor="middle" dominant-baseline="central"');
    expect(markup).toMatch(/animator-graph-edge__condition-badge[^>]+transform="translate\([^)]+\) rotate\([^)]+\)"/);
    expect(markup).toContain("Edit transition from Idle to Run: 2 conditions · 25%");
  });

  it("shows every supported parameter type in the compact connector summary", () => {
    const markup = render([
      { parameterId: "speed", mode: "greater", threshold: 0.2 },
      { parameterId: "steps", mode: "equals", threshold: 2 },
      { parameterId: "grounded", mode: "if" },
      { parameterId: "jump", mode: "triggered" },
    ]);

    expect(markup).toContain('data-parameter-types="F I B T"');
    expect(markup).toContain("F I B T · 4");
  });

  it("keeps unconditional connectors visually quiet", () => {
    const markup = render([]);

    expect(markup).not.toContain("data-condition-count");
    expect(markup).toContain("Edit transition from Idle to Run: no conditions · 25%");
  });
});
