import * as THREE from "three";
import type { TransformMode, TransformSpace } from "../../types";

export type TransformTargetKind = "object" | "modifier" | "collider-center" | "collider-face";

export type TransformControlPolicyArgs = {
  requestedMode: TransformMode;
  requestedSpace: TransformSpace;
  targetKind: TransformTargetKind;
  snapEnabled: boolean;
  translationSnap: number;
  rotationSnapDegrees: number;
  scaleSnap: number;
  gizmoSize: number;
};

export type TransformControlPolicy = {
  mode: TransformMode;
  space: TransformSpace;
  translationSnap: number | null;
  rotationSnap: number | null;
  scaleSnap: number | null;
  size: number;
};

const positiveOr = (value: number, fallback: number) => (
  Number.isFinite(value) && value > 0 ? value : fallback
);

const boundedPositive = (value: number, fallback: number, maximum: number) => (
  Math.min(positiveOr(value, fallback), maximum)
);

export function transformControlPolicy(args: TransformControlPolicyArgs): TransformControlPolicy {
  const specialized = args.targetKind !== "object";
  const mode = specialized ? "translate" : args.requestedMode;
  // Collider and modifier handles edit local component data. Object scaling is
  // also local by definition; exposing world-scale axes would misrepresent the
  // stored transform on rotated or parented objects.
  const space = specialized || mode === "scale" ? "local" : args.requestedSpace;
  const snapping = args.snapEnabled && !specialized;

  return {
    mode,
    space,
    translationSnap: snapping ? boundedPositive(args.translationSnap, 0.5, 100) : null,
    rotationSnap: snapping
      ? THREE.MathUtils.degToRad(boundedPositive(args.rotationSnapDegrees, 15, 180))
      : null,
    scaleSnap: snapping ? boundedPositive(args.scaleSnap, 0.1, 10) : null,
    size: THREE.MathUtils.clamp(positiveOr(args.gizmoSize, 0.7), 0.45, 1.4),
  };
}
