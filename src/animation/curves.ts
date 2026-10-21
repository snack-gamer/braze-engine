import type { CurveInterpolation, TransformChannelKeyframe } from "./types";

export const CURVE_INTERPOLATION_OPTIONS: Array<{ id: CurveInterpolation; label: string }> = [
  { id: "linear", label: "Linear" },
  { id: "step", label: "Constant" },
  { id: "smooth", label: "Smooth" },
  { id: "easeIn", label: "Ease In" },
  { id: "easeOut", label: "Ease Out" },
  { id: "easeInOut", label: "Ease In Out" },
  { id: "manual", label: "Manual" },
];

const CURVE_INTERPOLATIONS = new Set<CurveInterpolation>(
  CURVE_INTERPOLATION_OPTIONS.map((option) => option.id),
);

export function curveInterpolation(value: unknown): CurveInterpolation {
  if (value === "constant") return "step";
  if (value === "ease-in") return "easeIn";
  if (value === "ease-out") return "easeOut";
  if (value === "ease-in-out") return "easeInOut";
  return CURVE_INTERPOLATIONS.has(value as CurveInterpolation) ? (value as CurveInterpolation) : "linear";
}

export function curveInterpolationLabel(interpolation: CurveInterpolation) {
  return CURVE_INTERPOLATION_OPTIONS.find((option) => option.id === interpolation)?.label ?? "Linear";
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function segmentSlope(a: TransformChannelKeyframe, b: TransformChannelKeyframe) {
  const span = b.time - a.time;
  return span === 0 ? 0 : (b.value - a.value) / span;
}

function hermite(a: TransformChannelKeyframe, b: TransformChannelKeyframe, t: number) {
  const span = b.time - a.time;
  if (span <= 0) return a.value;
  const slope = segmentSlope(a, b);
  const outTangent = Number.isFinite(a.outTangent) ? a.outTangent! : slope;
  const inTangent = Number.isFinite(b.inTangent) ? b.inTangent! : slope;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * a.value + h10 * span * outTangent + h01 * b.value + h11 * span * inTangent;
}

function usesManualTangents(a: TransformChannelKeyframe, b: TransformChannelKeyframe) {
  return (
    a.interpolation === "manual" ||
    b.interpolation === "manual" ||
    Number.isFinite(a.outTangent) ||
    Number.isFinite(b.inTangent)
  );
}

function interpolationProgress(interpolation: CurveInterpolation, value: number) {
  const t = Math.min(Math.max(value, 0), 1);
  switch (interpolation) {
    case "step":
      return 0;
    case "smooth":
      return t * t * (3 - 2 * t);
    case "easeIn":
      return t * t * t;
    case "easeOut":
      return 1 - (1 - t) ** 3;
    case "easeInOut":
      return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
    case "manual":
    case "linear":
    default:
      return t;
  }
}

function blendCurveKeys(a: TransformChannelKeyframe, b: TransformChannelKeyframe, time: number) {
  const span = b.time - a.time;
  const normalized = span <= 0 ? 0 : Math.min(Math.max((time - a.time) / span, 0), 1);
  if (a.interpolation === "step") return a.value;
  if (usesManualTangents(a, b)) return hermite(a, b, normalized);
  return lerp(a.value, b.value, interpolationProgress(a.interpolation, normalized));
}

export function sampleCurveValue(keys: TransformChannelKeyframe[], time: number): number | null {
  if (keys.length === 0) return null;
  if (keys.length === 1 || time <= keys[0].time) return keys[0].value;
  const last = keys[keys.length - 1];
  if (time >= last.time) return last.value;
  let low = 0;
  let high = keys.length - 1;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (keys[mid].time <= time) low = mid;
    else high = mid;
  }
  return blendCurveKeys(keys[low], keys[high], time);
}
