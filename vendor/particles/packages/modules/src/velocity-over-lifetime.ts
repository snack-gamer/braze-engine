import {
  bakeCurveLUT,
  MinMaxCurve,
  Module,
  type ModuleManifest,
} from '@particles/core';

export interface VelocityOverLifetimeConfig {
  x: MinMaxCurve;
  y: MinMaxCurve;
  z: MinMaxCurve;
}

/**
 * Adds a per-axis velocity (in world space) over the particle's normalized lifetime.
 * Matches Unity's Shuriken "Velocity over Lifetime" with world space, constant or curve modes.
 */
export class VelocityOverLifetimeModule extends Module {
  readonly id = 'vol';
  config: VelocityOverLifetimeConfig;

  constructor(init: Partial<VelocityOverLifetimeConfig> = {}) {
    super();
    this.config = {
      x: init.x ?? MinMaxCurve.constant(0),
      y: init.y ?? MinMaxCurve.constant(0),
      z: init.z ?? MinMaxCurve.constant(0),
    };
  }

  build(): ModuleManifest {
    return {
      id: this.id,
      uniforms: [],
      luts: [
        { name: 'x', kind: 'curve', data: bakeCurveLUT(this.config.x), width: 256, height: 1 },
        { name: 'y', kind: 'curve', data: bakeCurveLUT(this.config.y), width: 256, height: 1 },
        { name: 'z', kind: 'curve', data: bakeCurveLUT(this.config.z), width: 256, height: 1 },
      ],
      simulateWGSL: /* wgsl */ `
        if (finite_life) {
          let rx = rand_unit(&seed);
          let ry = rand_unit(&seed);
          let rz = rand_unit(&seed);
          let vx = sample_curve_lut(vol__x_tex, nt);
          let vy = sample_curve_lut(vol__y_tex, nt);
          let vz = sample_curve_lut(vol__z_tex, nt);
          let add = vec3f(mix(vx.x, vx.y, rx), mix(vy.x, vy.y, ry), mix(vz.x, vz.y, rz));
          // Extra velocity, not acceleration: offset the position directly and
          // leave p.velocity to physics (gravity, effectors, collisions).
          p.position = vec4f(p.position.xyz + add * g.dt, p.position.w);
        }
      `,
    };
  }
}
