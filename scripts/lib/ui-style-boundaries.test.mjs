import assert from "node:assert/strict";
import test from "node:test";
import { uiStyleFailures } from "./ui-style-boundaries.mjs";

test("decorative UI gradients are rejected", () => {
  assert.deepEqual(uiStyleFailures(
    "styles/button.css",
    ".button { background: linear-gradient(red, blue); }",
  ), ["styles/button.css: decorative CSS gradient; use a flat theme surface or border"]);
});

test("the particle color spectrum remains an explicit functional exception", () => {
  assert.deepEqual(uiStyleFailures(
    "vendor/particles/packages/editor/src/theme.css",
    ".pi-cpicker-hue { background: linear-gradient(to right, red, blue); }",
  ), []);
  assert.equal(uiStyleFailures(
    "vendor/particles/packages/editor/src/theme.css",
    ".button { background: linear-gradient(red, blue); }",
  ).length, 1);
});

test("editor icon metrics stay in the shared theme", () => {
  assert.equal(uiStyleFailures("styles/menu.css", ".menu .editor-icon { width: 19px; }").length, 1);
  assert.equal(uiStyleFailures("styles/menu.css", ".menu { --icon-size-control: 19px; }").length, 1);
  assert.deepEqual(uiStyleFailures("theme.css", ":root { --icon-size-control: 16px; }"), []);
  assert.deepEqual(uiStyleFailures("styles/menu.css", ".editor-icon { width: var(--icon-size-control); }"), []);
  assert.deepEqual(uiStyleFailures("animation/curve.css", "svg { width: 100%; stroke-width: 2; }"), []);
});

test("React and DOM consumers share the semantic glyph registry", () => {
  assert.equal(uiStyleFailures("components/Menu.tsx", 'import { X } from "lucide";').length, 1);
  assert.equal(uiStyleFailures("components/Menu.tsx", 'import { X } from "lucide-react";').length, 1);
  assert.deepEqual(uiStyleFailures("ui/icons.ts", 'import { X } from "lucide";'), []);
  assert.deepEqual(uiStyleFailures("ui/editor-icon-element.ts", 'import { createElement } from "lucide";'), []);
});
