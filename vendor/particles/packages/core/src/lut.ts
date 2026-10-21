import type { MinMaxCurve } from './curve';
import type { MinMaxGradient } from './gradient';

/**
 * LUT resolution. 256 is plenty for most curves; bump if you see banding.
 */
const LUT_RESOLUTION = 256;

/**
 * Bake a MinMaxCurve to a Float32 LUT.
 * Returns interleaved [min, max] pairs of length LUT_RESOLUTION * 2.
 * For non-random modes, min == max.
 */
export function bakeCurveLUT(curve: MinMaxCurve, res = LUT_RESOLUTION): Float32Array {
  const out = new Float32Array(res * 2);
  for (let i = 0; i < res; i++) {
    const t = res === 1 ? 0 : i / (res - 1);
    const min = curve.sample(t, 0);
    const max = curve.sample(t, 1);
    out[i * 2 + 0] = min;
    out[i * 2 + 1] = max;
  }
  return out;
}

/**
 * Bake a MinMaxGradient to a Uint8 RGBA LUT.
 * Stored as two rows: row 0 = min, row 1 = max. Total length = res * 2 * 4.
 */
export function bakeGradientLUT(
  grad: MinMaxGradient,
  res = LUT_RESOLUTION,
): Uint8Array {
  const out = new Uint8Array(res * 2 * 4);
  for (let i = 0; i < res; i++) {
    const t = res === 1 ? 0 : i / (res - 1);
    const min = grad.sample(t, 0);
    const max = grad.sample(t, 1);
    const i0 = i * 4;
    const i1 = (res + i) * 4;
    out[i0 + 0] = clamp8(min[0]);
    out[i0 + 1] = clamp8(min[1]);
    out[i0 + 2] = clamp8(min[2]);
    out[i0 + 3] = clamp8(min[3]);
    out[i1 + 0] = clamp8(max[0]);
    out[i1 + 1] = clamp8(max[1]);
    out[i1 + 2] = clamp8(max[2]);
    out[i1 + 3] = clamp8(max[3]);
  }
  return out;
}

function clamp8(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 255;
  return Math.round(v * 255);
}
