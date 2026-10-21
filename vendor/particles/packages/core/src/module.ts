/**
 * A Module contributes to the particle pipeline by providing:
 *  - uniform values (numbers, vectors, colors)
 *  - LUT textures (baked curves / gradients)
 *  - WGSL snippets injected into the emit and/or simulate compute passes
 *
 * Backends consume `ModuleManifest` — they don't know about MinMaxCurve etc directly.
 * That keeps the core engine-agnostic and the GPU backend dumb-but-fast.
 */

export type UniformValue = number | readonly number[];

export interface UniformDescriptor {
  /** WGSL identifier — used verbatim inside snippet code as `u.<name>`. */
  name: string;
  /** Scalar (float), vec2, vec3, vec4, or array of those. */
  type: 'f32' | 'vec2f' | 'vec3f' | 'vec4f' | 'u32' | 'i32';
  value: UniformValue;
}

export type LUTKind = 'curve' | 'gradient';

export interface LUTDescriptor {
  /** WGSL identifier — bound as `<name>_tex` and `<name>_samp`. */
  name: string;
  kind: LUTKind;
  /** Float32 pairs (min,max) for curve; Uint8 RGBA rows for gradient. */
  data: Float32Array | Uint8Array;
  width: number;
  /** 1 for curve LUT (interleaved pairs), 2 for gradient (min row, max row). */
  height: number;
}

export interface ModuleManifest {
  /** Stable identifier used in WGSL define guards. Snake_case recommended. */
  id: string;
  uniforms: UniformDescriptor[];
  luts: LUTDescriptor[];
  /** WGSL run at particle spawn. `p` is the particle, `seed` is u32. */
  emitWGSL?: string;
  /** WGSL run each step. `p` is the particle, `dt` is f32, `nt` is f32 (0..1 normalized life). */
  simulateWGSL?: string;
}

export abstract class Module {
  /** Stable identifier. Override per module. */
  abstract readonly id: string;

  /** Toggle without removing from the list. */
  enabled = true;

  /** Compiled manifest for backends. */
  abstract build(): ModuleManifest;
}
