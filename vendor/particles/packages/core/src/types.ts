export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type Vec4 = readonly [number, number, number, number];
export type ColorRGBA = readonly [number, number, number, number];

export type SimulationSpace = 'local' | 'world';

export interface Keyframe {
  /** 0..1 normalized lifetime */
  time: number;
  value: number;
  /** Slope at this key. Default 0 (smooth). */
  inTangent?: number;
  outTangent?: number;
}

export interface ColorStop {
  /** 0..1 normalized lifetime */
  time: number;
  color: ColorRGBA;
}

export interface AlphaStop {
  time: number;
  alpha: number;
}
