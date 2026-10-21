import { Module, type ModuleManifest } from '@particles/core';
import type { BlendMode, RenderMaterial } from './renderer';

export type MaterialShading = 'unlit' | 'lit';

export interface ParticleMaterialConfig {
  preset: RenderMaterial;
  shading: MaterialShading;
  blendMode: BlendMode;
  tint: [number, number, number, number];
  baseMap?: string;
  alphaCutoff: number;
  emissiveStrength: number;
  twoSided: boolean;
  depthTest: boolean;
  depthWrite: boolean;
}

/**
 * Render-only material intent. Renderer decides particle shape/facing/mesh;
 * this module decides how that shape is shaded and blended.
 */
export class ParticleMaterialModule extends Module {
  readonly id = 'material';
  config: ParticleMaterialConfig;

  constructor(init: Partial<ParticleMaterialConfig> = {}) {
    super();
    const preset = init.preset ?? materialFromBlend(init.blendMode ?? 'alpha');
    this.config = {
      preset,
      shading: init.shading ?? (preset === 'softSmoke' ? 'lit' : 'unlit'),
      blendMode: init.blendMode ?? blendFromPreset(preset),
      tint: init.tint ?? [1, 1, 1, 1],
      baseMap: init.baseMap,
      alphaCutoff: init.alphaCutoff ?? 0,
      emissiveStrength: init.emissiveStrength ?? (preset === 'unlitAdditive' ? 1.5 : 1),
      twoSided: init.twoSided ?? true,
      depthTest: init.depthTest ?? true,
      depthWrite: init.depthWrite ?? false,
    };
  }

  build(): ModuleManifest {
    return { id: this.id, uniforms: [], luts: [] };
  }
}

function materialFromBlend(blend: BlendMode): RenderMaterial {
  if (blend === 'additive') return 'unlitAdditive';
  if (blend === 'multiply') return 'multiply';
  return 'unlitAlpha';
}

function blendFromPreset(preset: RenderMaterial): BlendMode {
  if (preset === 'unlitAdditive') return 'additive';
  if (preset === 'multiply') return 'multiply';
  return 'alpha';
}
