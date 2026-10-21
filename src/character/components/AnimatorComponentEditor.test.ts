import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CharacterAssetLibraryProvider } from "../application/CharacterAssetLibraryProvider";
import {
  addAnimatorStateMachine,
  addAnimatorStateToStateMachine,
} from "../application/animator-state-machine-authoring";
import { createDefaultAnimatorComponent } from "../domain/animator-component";
import { createAnimatorController } from "../domain/animator-controller";
import { AnimatorComponentEditor, readableAnimatorAssetReference } from "./AnimatorComponentEditor";

function renderEditor(
  readOnlyReason?: string,
  component = createDefaultAnimatorComponent(),
): string {
  return renderToStaticMarkup(createElement(
    CharacterAssetLibraryProvider,
    null,
    createElement(AnimatorComponentEditor, {
      component,
      modelGuid: "a".repeat(32),
      readOnlyReason,
      update: () => undefined,
      remove: () => undefined,
      onOpenController: () => undefined,
    }),
  ));
}

describe("AnimatorComponentEditor", () => {
  it("shows a readable local asset name without exposing the GUID", () => {
    expect(readableAnimatorAssetReference({
      guid: "a".repeat(32),
      localId: "controller:HeroLocomotion",
    }, "controller")).toBe("Hero Locomotion");
  });

  it("uses clear assigned and empty statuses when no sub-asset name exists", () => {
    expect(readableAnimatorAssetReference({ guid: "b".repeat(32), localId: "main" }, "avatar"))
      .toBe("Assigned avatar");
    expect(readableAnimatorAssetReference({ guid: "b".repeat(32), localId: "a".repeat(32) }, "avatar"))
      .toBe("Assigned avatar");
    expect(readableAnimatorAssetReference(undefined, "controller")).toBe("Not assigned");
  });

  it("preserves unsupported authored settings behind a visible read-only diagnostic", () => {
    const markup = renderEditor("Animator playback requires an available imported model source.");

    expect(markup).toContain("Animator Controller settings are read only.");
    expect(markup).toContain("Saved settings remain intact");
    expect(markup).toMatch(/<fieldset[^>]*disabled=""[^>]*>/);
    expect(markup).toContain("title=\"Remove Animator Controller\"");
  });

  it("leaves settings editable for supported imported model objects", () => {
    const markup = renderEditor();

    expect(markup).not.toContain("Animator Controller settings are read only.");
    expect(markup).not.toMatch(/<fieldset[^>]*disabled=""[^>]*>/);
    expect(markup).toContain("State Machine");
    expect(markup).toContain("Animator Controller");
    expect(markup).toContain("Unscaled Time (1× Clock)");
  });

  it("counts leaf states inside nested state machines", () => {
    let controller = addAnimatorStateMachine(
      createAnimatorController("controller"),
      "base-layer",
      undefined,
      { id: "locomotion", name: "Locomotion" },
    );
    controller = addAnimatorStateToStateMachine(
      controller,
      "base-layer",
      "locomotion",
      { id: "idle", name: "Idle" },
    );
    const markup = renderEditor(undefined, {
      ...createDefaultAnimatorComponent(),
      controller,
    });

    expect(markup).toContain("1L · 1S");
  });
});
