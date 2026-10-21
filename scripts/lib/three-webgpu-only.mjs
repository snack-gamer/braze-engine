import { brazeTslFacade, withBrazeTslExports } from './three-tsl-exports.mjs';
// The pinned Three r184 constructor otherwise retains its complete WebGL fallback.
// Braze has one backend: a failed WebGPU initialization must remain a failure.
const constructorBackend = `\t\tlet BackendClass;

\t\tif ( parameters.forceWebGL ) {

\t\t\tBackendClass = WebGLBackend;

\t\t} else {

\t\t\tBackendClass = WebGPUBackend;

\t\t\tparameters.getFallback = () => {

\t\t\t\twarn( 'WebGPURenderer: WebGPU is not available, running under WebGL2 backend.' );

\t\t\t\treturn new WebGLBackend( parameters );

\t\t\t};

\t\t}

\t\tconst backend = new BackendClass( parameters );`;
const webGpuBackend = `\t\tif ( parameters.forceWebGL ) throw new Error( 'Braze requires WebGPU; WebGL is unsupported.' );
\t\tparameters.getFallback = null;
\t\tconst backend = new WebGPUBackend( parameters );`;

/** Change only the known constructor, preserving all shader strings and other vendor code. */
export function webGpuOnlyThreeSource(source) {
  const marker = "class WebGPURenderer extends Renderer {", start = source.indexOf(marker);
  const backend = source.indexOf(constructorBackend, start);
  if (start < 0 || backend < start || source.indexOf(constructorBackend, backend + 1) !== -1) {
    throw new Error("Three WebGPURenderer constructor changed. Review Braze's r184 WebGPU-only adapter before upgrading.");
  }
  return source.slice(0, backend) + webGpuBackend + source.slice(backend + constructorBackend.length);
}

/** The same transform runs in builds and dependency preparation; node_modules stays untouched. */
export function createWebGpuOnlyThreePlugin() {
  return {
    name: "braze-three-webgpu-only",
    transform(source, id, options) {
      if (!options?.ssr && /\/src\/three\/tsl\.ts(?:\?|$)/.test(id.replaceAll("\\", "/"))) return { code: brazeTslFacade, map: null };
      if (!/\/node_modules\/three\/build\/three\.webgpu\.js(?:\?|$)/.test(id.replaceAll("\\", "/"))) return;
      return { code: withBrazeTslExports(webGpuOnlyThreeSource(source)), map: null };
    },
  };
}
