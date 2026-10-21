export type V3 = [number, number, number];
export type V4 = [number, number, number, number];

export function hashU32(x: number): number {
  let value = x >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

export function pcg(state: { value: number }): number {
  state.value = (Math.imul(state.value, 747796405) + 2891336453) >>> 0;
  let word = Math.imul(
    (state.value >>> (((state.value >>> 28) + 4) & 31)) ^ state.value,
    277803737,
  ) >>> 0;
  word = ((word >>> 22) ^ word) >>> 0;
  return word / 4294967296;
}

export function cross(a: V3, b: V3): V3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dot3(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function add3(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub3(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale3(a: V3, scale: number): V3 {
  return [a[0] * scale, a[1] * scale, a[2] * scale];
}

export function mul3(a: V3, b: V3): V3 {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

export function length3(a: V3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize3(a: V3, fallback: V3): V3 {
  const squared = dot3(a, a);
  if (squared <= 1e-10) return [...fallback] as V3;
  const inverse = 1 / Math.sqrt(squared);
  return [a[0] * inverse, a[1] * inverse, a[2] * inverse];
}

export function qmul(a: V4, b: V4): V4 {
  const av: V3 = [a[0], a[1], a[2]];
  const bv: V3 = [b[0], b[1], b[2]];
  const product = cross(av, bv);
  return [
    a[3] * b[0] + b[3] * a[0] + product[0],
    a[3] * b[1] + b[3] * a[1] + product[1],
    a[3] * b[2] + b[3] * a[2] + product[2],
    a[3] * b[3] - dot3(av, bv),
  ];
}

export function qrot(q: V4, vector: V3): V3 {
  const qv: V3 = [q[0], q[1], q[2]];
  const inner = add3(cross(qv, vector), scale3(vector, q[3]));
  return add3(vector, scale3(cross(qv, inner), 2));
}

export function qconj(q: V4): V4 {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function qnormalize(q: V4): V4 {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (length <= 1e-12) return [0, 0, 0, 1];
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

export function qnlerp(a: V4, b: V4, t: number): V4 {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const resolvedB: V4 = dot < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b;
  const amount = Math.min(1, Math.max(0, t));
  return qnormalize([
    a[0] + (resolvedB[0] - a[0]) * amount,
    a[1] + (resolvedB[1] - a[1]) * amount,
    a[2] + (resolvedB[2] - a[2]) * amount,
    a[3] + (resolvedB[3] - a[3]) * amount,
  ]);
}

export function eulerQuat(radians: V3): V4 {
  const halfX = radians[0] * 0.5;
  const halfY = radians[1] * 0.5;
  const halfZ = radians[2] * 0.5;
  const x: V4 = [Math.sin(halfX), 0, 0, Math.cos(halfX)];
  const y: V4 = [0, Math.sin(halfY), 0, Math.cos(halfY)];
  const z: V4 = [0, 0, Math.sin(halfZ), Math.cos(halfZ)];
  return qnormalize(qmul(z, qmul(y, x)));
}

export function quatFromBasis(right: V3, up: V3, forward: V3): V4 {
  const m00 = right[0], m01 = up[0], m02 = forward[0];
  const m10 = right[1], m11 = up[1], m12 = forward[1];
  const m20 = right[2], m21 = up[2], m22 = forward[2];
  let quaternion: V4;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2;
    quaternion = [(m21 - m12) / scale, (m02 - m20) / scale, (m10 - m01) / scale, 0.25 * scale];
  } else if (m00 > m11 && m00 > m22) {
    const scale = Math.sqrt(Math.max(1 + m00 - m11 - m22, 1e-8)) * 2;
    quaternion = [0.25 * scale, (m01 + m10) / scale, (m02 + m20) / scale, (m21 - m12) / scale];
  } else if (m11 > m22) {
    const scale = Math.sqrt(Math.max(1 + m11 - m00 - m22, 1e-8)) * 2;
    quaternion = [(m01 + m10) / scale, 0.25 * scale, (m12 + m21) / scale, (m02 - m20) / scale];
  } else {
    const scale = Math.sqrt(Math.max(1 + m22 - m00 - m11, 1e-8)) * 2;
    quaternion = [(m02 + m20) / scale, (m12 + m21) / scale, 0.25 * scale, (m10 - m01) / scale];
  }
  return qnormalize(quaternion);
}

export function axisCorrection(axis: number): V4 {
  const half = 0.707106781;
  if (axis === 1) return [0, 1, 0, 0];
  if (axis === 2) return [half, 0, 0, half];
  if (axis === 3) return [-half, 0, 0, half];
  if (axis === 4) return [0, -half, 0, half];
  if (axis === 5) return [0, half, 0, half];
  return [0, 0, 0, 1];
}

export function saturate(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function fract(value: number): number {
  return value - Math.floor(value);
}
