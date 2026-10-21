import assert from "node:assert/strict";
import test from "node:test";

import {
  architectureBoundaryFailures,
  importSpecifiers,
} from "./architecture-boundaries.mjs";

test("importSpecifiers recognizes static, side-effect, export, and dynamic imports", () => {
  assert.deepEqual(importSpecifiers(`
    import type { Scene } from "../scene";
    import "./register";
    export { Value } from './value';
    const adapter = import("three/webgpu");
  `), ["../scene", "./register", "./value", "three/webgpu"]);
});

test("importSpecifiers ignores import-like text in comments and strings", () => {
  assert.deepEqual(importSpecifiers(`
    // import React from "react";
    const diagnostic = 'export { Panel } from "../components/Panel"';
    import { Body } from "./body";
  `), ["./body"]);
});

test("domain boundaries reject UI, runtime, platform, and browser dependencies", () => {
  const failures = architectureBoundaryFailures("physics/domain/body.ts", `
    import React from "react";
    import { compile } from "../runtime/compiler";
    import { Panel } from "../../components/Panel";
    export const viewportWidth = window.innerWidth;
  `);
  assert.equal(failures.length, 4);
  assert.match(failures.join("\n"), /platform package 'react'/);
  assert.match(failures.join("\n"), /'runtime' layer/);
  assert.match(failures.join("\n"), /'components' layer/);
  assert.match(failures.join("\n"), /browser global/);
});

test("serialization may depend on domain codecs but not editor or Three adapters", () => {
  assert.deepEqual(
    architectureBoundaryFailures("scene/serialization/codec.ts", `
      import type { Scene } from "../domain/scene";
      import { parsePhysics } from "../../physics/serialization/codec";
    `),
    [],
  );
  const failures = architectureBoundaryFailures("scene/serialization/codec.ts", `
    import * as THREE from "three";
    import { Inspector } from "../../components/Inspector";
  `);
  assert.equal(failures.length, 2);
});

test("comments and diagnostic strings do not trigger browser-global checks", () => {
  assert.deepEqual(
    architectureBoundaryFailures("scene/domain/value.ts", `
      // window and localStorage are forbidden here.
      export const diagnostic = "navigator is unavailable";
    `),
    [],
  );
});

test("template expressions cannot hide browser-global access", () => {
  const failures = architectureBoundaryFailures("scene/domain/value.ts", `
    export const diagnostic = ` + "`viewport ${window.innerWidth}`" + `;
  `);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /browser global/);
});
