import {
  bakeGradientLUT,
  MinMaxGradient,
  Module,
  type ModuleManifest,
} from '@particles/core';

export interface ColorOverLifetimeConfig {
  color: MinMaxGradient;
}

export class ColorOverLifetimeModule extends Module {
  readonly id = 'col';
  config: ColorOverLifetimeConfig;

  constructor(init: Partial<ColorOverLifetimeConfig> = {}) {
    super();
    this.config = { color: init.color ?? MinMaxGradient.color([1, 1, 1, 1]) };
  }

  build(): ModuleManifest {
    return {
      id: this.id,
      uniforms: [],
      luts: [
        { name: 'grad', kind: 'gradient', data: bakeGradientLUT(this.config.color), width: 256, height: 2 },
      ],
      simulateWGSL: /* wgsl */ `
        if (finite_life) {
          let r = rand_unit(&seed);
          p.color = p.color * sample_gradient_lut(col__grad_tex, nt, r);
        }
      `,
    };
  }
}
