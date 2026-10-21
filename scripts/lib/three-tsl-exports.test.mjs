import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brazeTslNames, withBrazeTslExports, brazeTslFacade } from './three-tsl-exports.mjs';
import { createWebGpuOnlyThreePlugin } from './three-webgpu-only.mjs';

test('direct TSL exports preserve every facade binding and leave vendor implementation bytes intact', async () => {
  const url = new URL('../../node_modules/three/build/three.webgpu.js', import.meta.url), source = await readFile(url, 'utf8');
  const transformed = withBrazeTslExports(source);
  assert.equal(transformed.slice(0, source.length), source);
  const directory = await mkdtemp(join(tmpdir(), 'braze-tsl-bindings-'));
  try {
    const file = join(directory, 'bindings.mjs');
    await writeFile(file, transformed.replaceAll("'./three.core.js'", JSON.stringify(new URL('./three.core.js', url).href)));
    const module = await import(pathToFileURL(file).href);
    for (const name of brazeTslNames) assert.equal(module[`__braze_tsl_${name}`], module.TSL[name], name);
  } finally { await rm(directory, { recursive: true, force: true }); }
  const plugin = createWebGpuOnlyThreePlugin();
  assert.equal(plugin.transform('facade', '/engine/src/three/tsl.ts').code, brazeTslFacade);
  assert.equal(plugin.transform('facade', '/engine/src/three/tsl.ts', { ssr: true }), undefined);
  assert.throws(() => withBrazeTslExports(source.replace('Fn: Fn,', 'Fn: missing.binding,')), /binding Fn changed/);
  assert.throws(() => withBrazeTslExports('changed vendor'), /namespace changed/);
});
