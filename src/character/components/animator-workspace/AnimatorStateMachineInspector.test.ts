import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  addAnimatorStateMachine,
  addAnimatorStateToStateMachine,
  setAnimatorStateMachineStateClip,
} from "../../application/animator-state-machine-authoring";
import {
  addAnimatorLayer,
  setAnimatorLayerSynchronization,
} from "../../application/animator-controller-authoring";
import { createAnimatorController } from "../../domain/animator-controller";
import { addAnimatorTransition } from "../../application/animator-transition-authoring";
import { AnimatorStateInspector } from "./AnimatorStateInspector";
import { AnimatorStateMachineInspector } from "./AnimatorStateMachineInspector";
import { AnimatorTransitionInspector } from "./AnimatorTransitionInspector";
import type { AnimatorPreview } from "./useAnimatorPreview";

const PREVIEW: AnimatorPreview = {
  available: false,
  running: false,
  values: {},
  diagnostics: [],
  playback: [],
  transitions: [],
  setParameter: () => undefined,
};

describe("Animator nested state-machine inspectors", () => {
  it("omits redundant open and destructive controls for the current scope", () => {
    const controller = nestedController();
    const layer = controller.layers[0]!;
    const markup = renderToStaticMarkup(createElement(AnimatorStateMachineInspector, {
      controller,
      layer,
      stateMachineId: "combo",
      onChange: vi.fn(),
      onDeleted: vi.fn(),
      onOpen: vi.fn(),
      onSelectReaction: vi.fn(),
      onSelectExitRoute: vi.fn(),
      canDelete: false,
      canOpen: false,
    }));

    expect(markup).not.toContain("Open State Machine");
    expect(markup).not.toContain("Delete state machine");
    expect(markup).toContain("States 1 · Nested 0");
  });

  it("shows only supported state overrides on synchronized layers", () => {
    let controller = nestedController();
    controller = addAnimatorLayer(controller, { id: "upper", name: "Upper" });
    controller = setAnimatorLayerSynchronization(controller, "upper", "base-layer");
    const layer = controller.layers[1]!;
    const markup = renderToStaticMarkup(createElement(AnimatorStateInspector, {
      controller,
      layer,
      stateId: "attack",
      clips: [],
      preview: PREVIEW,
      onChange: vi.fn(),
      onDeleted: vi.fn(),
      onSelectTransition: vi.fn(),
    }));

    expect(markup).not.toContain('aria-label="Clip name"');
    expect(markup).not.toContain("Delete state");
    expect(markup).not.toContain('aria-label="Clip speed"');
    expect(markup).not.toContain('aria-label="Clip start offset"');
    expect(markup).toContain("Speed and offset are inherited");
    expect(markup).toContain("Inherited from the source layer");
  });

  it("keeps inherited transitions read only on synchronized layers", () => {
    let controller = nestedController();
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "state", stateId: "attack" },
      { kind: "exit" },
      { id: "inherited-transition" },
    );
    controller = addAnimatorLayer(controller, { id: "upper", name: "Upper" });
    controller = setAnimatorLayerSynchronization(controller, "upper", "base-layer");
    const layer = controller.layers[1]!;
    expect(layer.stateMachines?.[0]?.states[0]?.transitions).toEqual([]);
    const markup = renderToStaticMarkup(createElement(AnimatorTransitionInspector, {
      controller,
      layer,
      source: { kind: "state", stateId: "attack" },
      transitionId: "inherited-transition",
      clips: [],
      onChange: vi.fn(),
      onDeleted: vi.fn(),
    }));

    expect(markup).toContain("Inherited");
    expect(markup).not.toContain("Delete transition");
    expect(markup).not.toContain("Crossfade");
    expect(markup).not.toContain("Interruption");
    expect(markup).not.toContain("Conditions");
  });
});

function nestedController() {
  let controller = addAnimatorStateMachine(
    createAnimatorController("controller"),
    "base-layer",
    undefined,
    { id: "combo", name: "Combo" },
  );
  controller = addAnimatorStateToStateMachine(
    controller,
    "base-layer",
    "combo",
    { id: "attack", name: "Attack" },
  );
  return setAnimatorStateMachineStateClip(
    controller,
    "base-layer",
    "combo",
    "attack",
    { guid: "c".repeat(32), localId: "clip:attack" },
  );
}
