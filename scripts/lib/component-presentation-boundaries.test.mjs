import assert from "node:assert/strict";
import test from "node:test";
import { componentPresentationFailures } from "./component-presentation-boundaries.mjs";

const componentIcons = new Set(["meshFilter"]);

test("registered component icons must resolve through scene presentation", () => {
  const failures = componentPresentationFailures(
    "components/scene/MaterialSection.tsx",
    '<EditorIcon name="meshFilter" size="control" />',
    componentIcons,
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /use SceneComponentPresentation/);
});

test("dynamic registry icons and documented non-component reuse remain valid", () => {
  assert.deepEqual(componentPresentationFailures(
    "components/scene/SceneComponentPresentation.tsx",
    '<EditorIcon name={presentation.componentIcon} size="control" />',
    componentIcons,
  ), []);
  assert.deepEqual(componentPresentationFailures(
    "ui/GridSettingsControls.tsx",
    '<EditorIcon name="meshFilter" size="compact" />',
    componentIcons,
    new Set(["meshFilter"]),
  ), []);
});
