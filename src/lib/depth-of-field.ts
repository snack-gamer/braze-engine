import type { CameraState, DepthOfFieldComponent, SceneObject, Vec3 } from "../types";
import { objectFocusBounds, type ObjectFocusBounds } from "./hierarchy";

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distanceTo(camera: CameraState, target: Vec3) {
  return Math.hypot(
    target[0] - camera.position[0],
    target[1] - camera.position[1],
    target[2] - camera.position[2],
  );
}

type AutoDepthOfFieldOptions = Pick<DepthOfFieldComponent, "autoFocusWidth" | "autoBlurStrength">;

export function autoDepthOfFieldValues(
  camera: CameraState,
  target: Vec3 | ObjectFocusBounds,
  options?: Partial<AutoDepthOfFieldOptions>,
) {
  const position = Array.isArray(target) ? target : target.position;
  const radius = Array.isArray(target) ? 0 : target.radius;
  const focusWidth = clamp(options?.autoFocusWidth ?? 1, 0.25, 3);
  const blurStrength = clamp(options?.autoBlurStrength ?? 1, 0.2, 2.5);
  const centerDistance = Math.max(0.1, distanceTo(camera, position));
  const distance = Math.max(0.1, centerDistance - radius * 0.45);
  const baseFStop = Math.min(4, Math.max(1.4, 1.4 + distance * 0.16));
  const fStop = clamp(baseFStop / blurStrength, 0.7, 16);
  const baseFocusRange = Math.min(6, Math.max(1.4, radius * 3.2, centerDistance * 0.14));
  const focusRange = clamp(baseFocusRange * focusWidth, 0.15, 12);
  return {
    focusDistance: round(distance, 3),
    fStop: round(fStop, 1),
    focusRange: round(focusRange, 3),
  };
}

export function resolveEffectiveDepthOfField(
  depthOfField: DepthOfFieldComponent | null,
  camera: CameraState,
  objects: SceneObject[],
): DepthOfFieldComponent | null {
  if (!depthOfField || depthOfField.mode !== "auto") return depthOfField;
  if (!depthOfField.targetObjectId) return { ...depthOfField, enabled: false };
  const target = objectFocusBounds(objects, depthOfField.targetObjectId);
  if (!target) return { ...depthOfField, enabled: false };
  return {
    ...depthOfField,
    ...autoDepthOfFieldValues(camera, target, depthOfField),
  };
}
