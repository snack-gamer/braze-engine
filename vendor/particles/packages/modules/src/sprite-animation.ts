import { MinMaxCurve, Module, type ModuleManifest } from '@particles/core';

export type FlipbookAnimation = 'wholeSheet' | 'singleRow';
export type FlipbookTimeMode = 'fps' | 'lifetime' | 'speed';
export type FlipbookPlayback = 'once' | 'loop' | 'pingPong' | 'holdLast';
export type FlipbookRowMode = 'custom' | 'random';

export interface SpriteAnimationConfig {
  /** Atlas columns. */
  cols: number;
  /** Atlas rows. Total frames = cols * rows. */
  rows: number;
  /** 0..1 over the particle's life. Multiplied by `cycles` to repeat. */
  frameOverLifetime: MinMaxCurve;
  /** How many times to cycle through the sheet over one lifetime. */
  cycles: number;
  animation: FlipbookAnimation;
  timeMode: FlipbookTimeMode;
  playback: FlipbookPlayback;
  fps: number;
  speedRange: readonly [number, number];
  startFrame: number;
  randomStart: boolean;
  rowMode: FlipbookRowMode;
  row: number;
  /**
   * Data URL of a user-uploaded sprite-sheet image. When set, the backend uses
   * it (sliced by cols/rows) instead of the procedural test atlas. Persists
   * with the system.
   */
  customAtlas?: string;
}

/**
 * Drives sprite-sheet frame selection. The backend bakes `frameOverLifetime`
 * to a LUT bound to the render pipeline; the vertex shader samples it per
 * frame to compute the atlas UV.
 */
export class SpriteAnimationModule extends Module {
  readonly id = 'spriteAnim';
  config: SpriteAnimationConfig;

  constructor(init: Partial<SpriteAnimationConfig> = {}) {
    super();
    this.config = {
      cols: init.cols ?? 4,
      rows: init.rows ?? 4,
      frameOverLifetime: init.frameOverLifetime ?? MinMaxCurve.curve([
        { time: 0, value: 0 },
        { time: 1, value: 1 },
      ]),
      cycles: init.cycles ?? 1,
      animation: init.animation ?? 'wholeSheet',
      timeMode: init.timeMode ?? 'fps',
      playback: init.playback ?? 'loop',
      fps: init.fps ?? 24,
      speedRange: init.speedRange ?? [0, 5],
      startFrame: init.startFrame ?? 0,
      randomStart: init.randomStart ?? false,
      rowMode: init.rowMode ?? 'custom',
      row: init.row ?? 0,
      customAtlas: init.customAtlas,
    };
  }

  build(): ModuleManifest {
    // Render-only — config consumed directly by backend.
    return { id: this.id, uniforms: [], luts: [] };
  }
}
