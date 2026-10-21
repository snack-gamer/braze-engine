import {
  bakeCurveLUT,
  bakeGradientLUT,
  MinMaxCurve,
  MinMaxGradient,
  Module,
  type ModuleManifest,
} from '@particles/core';

export interface MainModuleConfig {
  startLifetime: MinMaxCurve;
  startSpeed: MinMaxCurve;
  startSize: MinMaxCurve;
  startRotation: MinMaxCurve;
  /** Per-particle spawn colour; lifetime colour modules multiply this value. */
  startColor: MinMaxGradient;
  /** Never expire particles; BrazeFX bypasses over-life modules in this mode. */
  infiniteLifetime: boolean;
  gravityModifier: MinMaxCurve;
}

/**
 * Always-on module that sets initial particle state and applies gravity.
 * Matches Unity's Shuriken "Main" module.
 */
export class MainModule extends Module {
  readonly id = 'main';
  config: MainModuleConfig;

  constructor(init: Partial<MainModuleConfig> = {}) {
    super();
    this.config = {
      startLifetime: init.startLifetime ?? MinMaxCurve.constant(2),
      startSpeed: init.startSpeed ?? MinMaxCurve.constant(2),
      startSize: init.startSize ?? MinMaxCurve.constant(0.1),
      startRotation: init.startRotation ?? MinMaxCurve.constant(0),
      startColor: init.startColor ?? MinMaxGradient.color([1, 1, 1, 1]),
      infiniteLifetime: init.infiniteLifetime ?? false,
      gravityModifier: init.gravityModifier ?? MinMaxCurve.constant(0),
    };
  }

  build(): ModuleManifest {
    return {
      id: this.id,
      uniforms: [{ name: 'infinite', type: 'u32', value: this.config.infiniteLifetime ? 1 : 0 }],
      luts: [
        { name: 'lifetime', kind: 'curve', data: bakeCurveLUT(this.config.startLifetime), width: 256, height: 1 },
        { name: 'speed',    kind: 'curve', data: bakeCurveLUT(this.config.startSpeed),    width: 256, height: 1 },
        { name: 'size',     kind: 'curve', data: bakeCurveLUT(this.config.startSize),     width: 256, height: 1 },
        { name: 'rotation', kind: 'curve', data: bakeCurveLUT(this.config.startRotation), width: 256, height: 1 },
        { name: 'color',    kind: 'gradient', data: bakeGradientLUT(this.config.startColor), width: 256, height: 2 },
        { name: 'gravity',  kind: 'curve', data: bakeCurveLUT(this.config.gravityModifier), width: 256, height: 1 },
      ],
      emitWGSL: /* wgsl */ `
        {
          let r0 = rand_unit(&seed);
          let r1 = rand_unit(&seed);
          let r2 = rand_unit(&seed);
          let r3 = rand_unit(&seed);
          let life = sample_curve_lut(main__lifetime_tex, 0.0);
          let spd  = sample_curve_lut(main__speed_tex,    0.0);
          let sz   = sample_curve_lut(main__size_tex,     0.0);
          let rot  = sample_curve_lut(main__rotation_tex, 0.0);
          let color = sample_gradient_lut(main__color_tex, 0.0, rand_unit(&seed));

          p.position.w = select(mix(life.x, life.y, r0), 1.0e20, u.main__infinite == 1u);
          // Velocity gets a default outward-from-origin direction; Shape overrides this.
          let dir = vec3f(0.0, 1.0, 0.0);
          p.velocity = vec4f(dir * mix(spd.x, spd.y, r1), 0.0);
          let sizeVal = mix(sz.x, sz.y, r2);
          p.params = vec4f(sizeVal, sizeVal, mix(rot.x, rot.y, r3), bitcast<f32>(seed));
          p.color = color;
          p.start_color = color;
        }
      `,
      simulateWGSL: /* wgsl */ `
        {
          let gv = sample_curve_lut(main__gravity_tex, nt);
          let r = rand_unit(&seed);
          let gravity = mix(gv.x, gv.y, r);
          p.velocity.y = p.velocity.y - 9.81 * gravity * g.dt;
        }
      `,
    };
  }
}
