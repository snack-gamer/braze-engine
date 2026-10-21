import { Module, type ModuleManifest } from '@particles/core';

export interface Burst {
  /** Time in seconds (relative to system start, looped). */
  time: number;
  /** Particles to spawn in this burst. */
  count: number;
}

export interface EmissionModuleConfig {
  /** Particles per second. */
  rate: number;
  bursts: Burst[];
}

/**
 * Drives spawn count. Stored as a uniform `rate` (read host-side, multiplied by dt).
 * Bursts are consumed host-side in `consumeBursts(time)`.
 */
export class EmissionModule extends Module {
  readonly id = 'emission';
  config: EmissionModuleConfig;

  // Track by Burst reference (not index) so adding/removing bursts mid-edit
  // doesn't shift indices and break the "already fired" check.
  private firedBurstsThisLoop = new Set<Burst>();
  private lastTime = 0;

  constructor(init: Partial<EmissionModuleConfig> = {}) {
    super();
    this.config = {
      rate: init.rate ?? 100,
      bursts: init.bursts ?? [],
    };
  }

  build(): ModuleManifest {
    return {
      id: this.id,
      uniforms: [
        { name: 'rate', type: 'f32', value: this.config.rate },
      ],
      luts: [],
      // Emission affects host-side spawn count, not GPU behavior — empty snippets.
    };
  }

  consumeBursts(time: number): number {
    let total = 0;
    if (time < this.lastTime) {
      // Looped — clear fired set.
      this.firedBurstsThisLoop.clear();
    }
    for (const b of this.config.bursts) {
      if (time >= b.time && !this.firedBurstsThisLoop.has(b)) {
        this.firedBurstsThisLoop.add(b);
        total += b.count;
      }
    }
    this.lastTime = time;
    return total;
  }
}
