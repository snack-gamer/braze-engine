import { bakeGradientLUT, MinMaxGradient, Module, type ModuleManifest } from '@particles/core';

/** BrazeFX Color By Speed: multiplies the current colour with a speed ramp. */
export class ColorBySpeedModule extends Module {
  readonly id = 'cbs';
  config: { color: MinMaxGradient; range: readonly [number, number] };

  constructor(init: Partial<{ color: MinMaxGradient; range: readonly [number, number] }> = {}) {
    super();
    this.config = { color: init.color ?? MinMaxGradient.color([1, 1, 1, 1]), range: init.range ?? [0, 5] };
  }

  build(): ModuleManifest {
    return {
      id: this.id,
      uniforms: [{ name: 'range', type: 'vec2f', value: [...this.config.range] }],
      luts: [{ name: 'grad', kind: 'gradient', data: bakeGradientLUT(this.config.color), width: 256, height: 2 }],
      simulateWGSL: /* wgsl */ `
        if (finite_life) {
          let range = u.cbs__range;
          let t = clamp((length(p.velocity.xyz) - range.x) / max(range.y - range.x, 1e-5), 0.0, 1.0);
          p.color = p.color * sample_gradient_lut(cbs__grad_tex, t, rand_unit(&seed));
        }
      `,
    };
  }
}
