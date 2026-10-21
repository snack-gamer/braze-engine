import type { Keyframe } from './types';

export type MinMaxCurveMode =
  | 'constant'
  | 'curve'
  | 'twoConstants'
  | 'twoCurves';

export interface MinMaxCurveData {
  mode: MinMaxCurveMode;
  /** Scalar multiplier applied to all curve samples. */
  scalar: number;
  /** Used for 'constant' and as min for 'twoConstants'. */
  constant: number;
  /** Used as max for 'twoConstants'. */
  constantMax: number;
  /** Used for 'curve' and as min for 'twoCurves'. Must be sorted by time. */
  curve: Keyframe[];
  /** Used as max for 'twoCurves'. */
  curveMax: Keyframe[];
}

const DEFAULT_KEYS: Keyframe[] = [
  { time: 0, value: 1 },
  { time: 1, value: 1 },
];

export class MinMaxCurve {
  data: MinMaxCurveData;

  constructor(init: Partial<MinMaxCurveData> = {}) {
    this.data = {
      mode: init.mode ?? 'constant',
      scalar: init.scalar ?? 1,
      constant: init.constant ?? 1,
      constantMax: init.constantMax ?? 1,
      curve: init.curve ?? DEFAULT_KEYS,
      curveMax: init.curveMax ?? DEFAULT_KEYS,
    };
  }

  static constant(value: number): MinMaxCurve {
    return new MinMaxCurve({ mode: 'constant', constant: value });
  }

  static between(min: number, max: number): MinMaxCurve {
    return new MinMaxCurve({
      mode: 'twoConstants',
      constant: min,
      constantMax: max,
    });
  }

  static curve(keys: Keyframe[], scalar = 1): MinMaxCurve {
    return new MinMaxCurve({ mode: 'curve', curve: keys, scalar });
  }

  /** CPU-side sample for previews and validation. t is 0..1. r is 0..1 PRNG. */
  sample(t: number, r = 0.5): number {
    const d = this.data;
    switch (d.mode) {
      case 'constant':
        return d.constant * d.scalar;
      case 'twoConstants':
        return (d.constant + (d.constantMax - d.constant) * r) * d.scalar;
      case 'curve':
        return sampleKeys(d.curve, t) * d.scalar;
      case 'twoCurves': {
        const a = sampleKeys(d.curve, t);
        const b = sampleKeys(d.curveMax, t);
        return (a + (b - a) * r) * d.scalar;
      }
    }
  }
}

export function sampleKeys(keys: readonly Keyframe[], t: number): number {
  if (keys.length === 0) return 0;
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  if (t <= first.time) return first.value;
  if (t >= last.time) return last.value;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      if (span <= 0) return b.value;
      const u = (t - a.time) / span;
      // Hermite if tangents present, else linear.
      const m0 = a.outTangent;
      const m1 = b.inTangent;
      if (m0 === undefined && m1 === undefined) {
        return a.value + (b.value - a.value) * u;
      }
      return hermite(a.value, b.value, m0 ?? 0, m1 ?? 0, u, span);
    }
  }
  return last.value;
}

function hermite(
  p0: number,
  p1: number,
  m0: number,
  m1: number,
  t: number,
  span: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0 + h10 * span * m0 + h01 * p1 + h11 * span * m1;
}
