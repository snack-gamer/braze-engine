import { Module, type ModuleManifest } from '@particles/core';

export type CollisionResponseMode = 'slide' | 'bounce' | 'stick' | 'settle';

export interface CollisionModuleConfig {
  mode: CollisionResponseMode;
  /** Extra visual particle radius multiplier used by collider tests. */
  radiusScale: number;
  /** Global response multiplier, 0 disables collision without removing colliders. */
  strength: number;
}

/**
 * Enables lightweight GPU collider response for particles in an effect.
 * Collider shapes live on the parent ParticleEffect; this module decides
 * whether this emitter should react to them and how strongly.
 */
export class CollisionModule extends Module {
  readonly id = 'collision';
  config: CollisionModuleConfig;

  constructor(init: Partial<CollisionModuleConfig> = {}) {
    super();
    this.config = {
      mode: init.mode ?? 'settle',
      radiusScale: init.radiusScale ?? 0.5,
      strength: init.strength ?? 1,
    };
  }

  build(): ModuleManifest {
    return {
      id: this.id,
      uniforms: [
        { name: 'params', type: 'vec4f', value: [
          responseModeCode(this.config.mode),
          this.config.radiusScale,
          this.config.strength,
          0,
        ] },
      ],
      luts: [],
      simulateWGSL: /* wgsl */ `
        {
          p = apply_particle_colliders(
            p,
            i,
            u.collision__params.x,
            max(u.collision__params.y, 0.0),
            clamp(u.collision__params.z, 0.0, 1.0),
          );
        }
      `,
    };
  }
}

function responseModeCode(mode: CollisionResponseMode): number {
  if (mode === 'slide') return 0;
  if (mode === 'bounce') return 1;
  if (mode === 'stick') return 2;
  return 3;
}
