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
    "vendor/particles/packages/editor/src/theme.ts",
    ".pi-cpicker-hue { background: linear-gradient(to right, red, blue); }",
  ), []);
  assert.equal(uiStyleFailures(
    "vendor/particles/packages/editor/src/theme.ts",
    ".button { background: linear-gradient(red, blue); }",
  ).length, 1);
});
