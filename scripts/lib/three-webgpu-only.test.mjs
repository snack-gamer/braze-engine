import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { webGpuOnlyThreeSource, createWebGpuOnlyThreePlugin } from "./three-webgpu-only.mjs";

test("the pinned vendor adapter keeps the WebGPU constructor and revokes forced/automatic WebGL", async () => {
  const source = await readFile(new URL("../../node_modules/three/build/three.webgpu.js", import.meta.url), "utf8");
  const transformed = webGpuOnlyThreeSource(source);
  const extract = (code) => code.slice(code.indexOf("class WebGPURenderer extends Renderer {"), code.indexOf("class BundleGroup extends Group {"));
  assert.ok(extract(source).includes("new WebGLBackend"));
  assert.ok(!extract(transformed).includes("WebGLBackend"));
  assert.ok(extract(transformed).includes("parameters.getFallback = null"));
  assert.equal(source.slice(0, source.indexOf("class WebGPURenderer")), transformed.slice(0, transformed.indexOf("class WebGPURenderer")), "shader/library prefix is byte-identical");
  assert.equal(source.slice(source.indexOf("class BundleGroup")), transformed.slice(transformed.indexOf("class BundleGroup")), "remaining vendor exports are byte-identical");
  const implementation = extract(transformed);
  const factory = new Function("Renderer", "WebGPUBackend", "StandardNodeLibrary", `${implementation}; return WebGPURenderer;`);
  class Backend { constructor(options) { this.options = options; } }
  class Renderer { constructor(backend, options) { this.backend = backend; this.options = options; } }
  const WebGpuRenderer = factory(Renderer, Backend, class {}), options = { getFallback() { throw Error("must not run"); } };
  const renderer = new WebGpuRenderer(options);
  assert.ok(renderer.backend instanceof Backend); assert.equal(options.getFallback, null);
  assert.equal(renderer.isWebGPURenderer, true);
  assert.throws(() => new WebGpuRenderer({ forceWebGL: true }), /WebGL is unsupported/);
  const FailingRenderer = factory(Renderer, class { constructor() { throw Error("device failure"); } }, class {});
  assert.throws(() => new FailingRenderer(), /device failure/);
});

test("the vendor transform is narrow and fails closed when the pinned constructor changes", () => {
  const plugin = createWebGpuOnlyThreePlugin();
  assert.equal(plugin.transform("untouched", "/engine/src/three/renderer.ts"), undefined);
  assert.throws(() => plugin.transform("class WebGPURenderer extends Renderer {}", "/engine/node_modules/three/build/three.webgpu.js"), /constructor changed/);
});
