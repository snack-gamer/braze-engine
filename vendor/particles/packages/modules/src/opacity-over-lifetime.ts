import { bakeCurveLUT, MinMaxCurve, Module, type ModuleManifest } from '@particles/core';

/** BrazeFX Opacity over Lifetime. This is separate from the colour ramp so
 * artists can tune fade timing without disturbing HDR/tint colour. */
export class OpacityOverLifetimeModule extends Module {
  readonly id = 'opl';
  config: { alpha: MinMaxCurve };

  constructor(init: Partial<{ alpha: MinMaxCurve }> = {}) {
    super();
    this.config = {
      alpha: init.alpha ?? MinMaxCurve.curve([
        { time: 0, value: 1 }, { time: 0.8, value: 1 }, { time: 1, value: 0 },
      ]),
    };
  }

  build(): ModuleManifest {
    return {
      id: this.id,
      uniforms: [],
      luts: [{ name: 'alpha', kind: 'curve', data: bakeCurveLUT(this.config.alpha), width: 256, height: 1 }],
      simulateWGSL: /* wgsl */ `
        if (finite_life) {
          let band = sample_curve_lut(opl__alpha_tex, nt);
          p.color.a = p.color.a * mix(band.x, band.y, rand_unit(&seed));
        }
      `,
    };
  }
}
