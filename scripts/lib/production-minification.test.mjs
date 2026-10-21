import assert from "node:assert/strict";
import test from "node:test";
import { minify } from "terser";
import { minifySync } from "rolldown/utils";
import { productionMinification } from "./production-minification.mjs";

test("production minification retains public APIs, observed reads, logging and exact shader strings", async () => {
  const shader = "// diagnostic source\n@compute @workgroup_size(1)\nfn main() { /* retained */ }\n";
  const source = `
    let accesses = 0, logs = 0;
    const tracked = { get resource() { accesses++; return 1; } };
    const console = { info() { logs++; } };
    export const shader = ${JSON.stringify(shader)};
    export class PublicRuntime { createBuffer(value) { return { buffer: value, generation: 7 }; } }
    export async function inspect() {
      tracked.resource; console.info('diagnostic');
      const publicRuntime = new PublicRuntime();
      return { accesses, logs, result: publicRuntime['createBuffer'](42) };
    }
  `;
  const { maxWorkers: _workers, ...options } = productionMinification().terserOptions;
  const result = await minify(source, options);
  const compact = minifySync("runtime.js", result.code, { module: true, compress: true, mangle: true });
  assert.deepEqual(compact.errors, []);
  const runtime = await import(`data:text/javascript;base64,${Buffer.from(compact.code).toString("base64")}`);
  assert.equal(runtime.shader, shader);
  assert.deepEqual(await runtime.inspect(), { accesses: 1, logs: 1, result: { buffer: 42, generation: 7 } });
  assert.deepEqual(await runtime.inspect(), { accesses: 2, logs: 2, result: { buffer: 42, generation: 7 } });
});
