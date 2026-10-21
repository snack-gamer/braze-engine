import {
  bakeCurveLUT,
  MinMaxCurve,
  Module,
  type ModuleManifest,
} from '@particles/core';

export interface SizeOverLifetimeConfig {
  size: MinMaxCurve;
}

/**
 * Multiplies the starting size (params.x) by a curve sample to produce the current size (params.y).
 * The starting size is captured by the Main module at spawn; this module only writes y.
 */
export class SizeOverLifetimeModule extends Module {
  readonly id = 'sol';
  config: SizeOverLifetimeConfig;

  constructor(init: Partial<SizeOverLifetimeConfig> = {}) {
    super();
    this.config = { size: init.size ?? MinMaxCurve.constant(1) };
  }

  build(): ModuleManifest {
    return {
      id: this.id,
      uniforms: [],
      luts: [
        { name: 'size', kind: 'curve', data: bakeCurveLUT(this.config.size), width: 256, height: 1 },
      ],
      simulateWGSL: /* wgsl */ `
        if (finite_life) {
          let r = rand_unit(&seed);
          let s = sample_curve_lut(sol__size_tex, nt);
          let mult = mix(s.x, s.y, r);
          p.params.y = p.params.x * mult;
        }
      `,
    };
  }
}
