import type { AlphaStop, ColorRGBA, ColorStop } from './types';

export type MinMaxGradientMode =
  | 'color'
  | 'gradient'
  | 'twoColors'
  | 'twoGradients';

export interface GradientData {
  /** Sorted by time. */
  colorStops: ColorStop[];
  /** Sorted by time. */
  alphaStops: AlphaStop[];
}

export interface MinMaxGradientData {
  mode: MinMaxGradientMode;
  color: ColorRGBA;
  colorMax: ColorRGBA;
  gradient: GradientData;
  gradientMax: GradientData;
}

const WHITE: ColorRGBA = [1, 1, 1, 1];
const DEFAULT_GRADIENT: GradientData = {
  colorStops: [
    { time: 0, color: [1, 1, 1, 1] },
    { time: 1, color: [1, 1, 1, 1] },
  ],
  alphaStops: [
    { time: 0, alpha: 1 },
    { time: 1, alpha: 1 },
  ],
};

export class MinMaxGradient {
  data: MinMaxGradientData;

  constructor(init: Partial<MinMaxGradientData> = {}) {
    this.data = {
      mode: init.mode ?? 'color',
      color: init.color ?? WHITE,
      colorMax: init.colorMax ?? WHITE,
      gradient: init.gradient ?? DEFAULT_GRADIENT,
      gradientMax: init.gradientMax ?? DEFAULT_GRADIENT,
    };
  }

  static color(c: ColorRGBA): MinMaxGradient {
    return new MinMaxGradient({ mode: 'color', color: c });
  }

  static gradient(g: GradientData): MinMaxGradient {
    return new MinMaxGradient({ mode: 'gradient', gradient: g });
  }

  sample(t: number, r = 0.5): ColorRGBA {
    const d = this.data;
    switch (d.mode) {
      case 'color':
        return d.color;
      case 'twoColors':
        return lerpColor(d.color, d.colorMax, r);
      case 'gradient':
        return sampleGradient(d.gradient, t);
      case 'twoGradients': {
        const a = sampleGradient(d.gradient, t);
        const b = sampleGradient(d.gradientMax, t);
        return lerpColor(a, b, r);
      }
    }
  }
}

export function sampleGradient(g: GradientData, t: number): ColorRGBA {
  const c = sampleColorStops(g.colorStops, t);
  const a = sampleAlphaStops(g.alphaStops, t);
  return [c[0], c[1], c[2], a];
}

function sampleColorStops(stops: readonly ColorStop[], t: number): ColorRGBA {
  if (stops.length === 0) return [1, 1, 1, 1];
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  if (t <= first.time) return first.color;
  if (t >= last.time) return last.color;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      const u = span <= 0 ? 0 : (t - a.time) / span;
      return lerpColor(a.color, b.color, u);
    }
  }
  return last.color;
}

function sampleAlphaStops(stops: readonly AlphaStop[], t: number): number {
  if (stops.length === 0) return 1;
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  if (t <= first.time) return first.alpha;
  if (t >= last.time) return last.alpha;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      const u = span <= 0 ? 0 : (t - a.time) / span;
      return a.alpha + (b.alpha - a.alpha) * u;
    }
  }
  return last.alpha;
}

function lerpColor(a: ColorRGBA, b: ColorRGBA, t: number): ColorRGBA {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}
