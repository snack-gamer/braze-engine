import type { PhysicsVec3 as Vec } from "../../domain/components";

const sub = (a: Vec, b: Vec) => a.map((v, i) => v - b[i]) as Vec;
const dot = (a: Vec, b: Vec) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const along = (a: Vec, d: Vec, t: number) => a.map((v, i) => v + d[i] * t) as Vec;

/** Closest Voronoi region on a nondegenerate triangle, including its boundary. */
export function closestTrianglePoint(point: Vec, a: Vec, b: Vec, c: Vec): Vec {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(point, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [...a];
  const bp = sub(point, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [...b];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return along(a, ab, d1 / (d1 - d3));
  const cp = sub(point, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [...c];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return along(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 >= d3 && d5 >= d6) return along(b, sub(c, b), (d4 - d3) / (d4 - d3 + d5 - d6));
  return a.map((v, i) => v + (ab[i] * vb + ac[i] * vc) / (va + vb + vc)) as Vec;
}
