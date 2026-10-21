import type { Module } from './module';
import type { SimulationSpace } from './types';

export interface ParticleSystemConfig {
  /** Hard cap. Backend allocates buffers for this many particles. */
  capacity: number;
  /** Initial seed for the system PRNG. */
  seed: number;
  /** Local or world space simulation. */
  simulationSpace: SimulationSpace;
  /** Looping. */
  looping: boolean;
  /** Total duration in seconds; loops if `looping`. */
  duration: number;
  /** Playback speed multiplier. */
  timeScale: number;
}

export const DEFAULT_CONFIG: ParticleSystemConfig = {
  capacity: 100_000,
  seed: 1,
  simulationSpace: 'world',
  looping: true,
  duration: 5,
  timeScale: 1,
};

export class ParticleSystem {
  config: ParticleSystemConfig;
  readonly modules: Module[] = [];

  constructor(init: Partial<ParticleSystemConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...init };
  }

  add<M extends Module>(module: M): M {
    this.modules.push(module);
    return module;
  }

  get<M extends Module>(id: string): M | undefined {
    return this.modules.find((m) => m.id === id) as M | undefined;
  }
}
