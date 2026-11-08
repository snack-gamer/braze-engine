import type { Vec3 } from "./scene-values";

export type CameraSettings = {
  target: Vec3;
  fov: number;
  near: number;
  far: number;
  projection?: "perspective" | "orthographic";
  fovAxis?: "vertical" | "horizontal";
  /** Half of the vertical view size in world metres. */
  orthographicSize?: number;
  /** Unsigned 32-bit project object-layer mask, independent of renderer layers. */
  cullingMask?: number;
  background?: "environment" | "solid";
  backgroundColor?: string;
};

export type DepthOfFieldComponent = {
  enabled: boolean;
  mode: "manual" | "auto";
  focusDistance: number;
  fStop: number;
  targetObjectId?: string;
  autoFocusWidth: number;
  autoBlurStrength: number;
  focusRange?: number;
};

export type CameraState = {
  position: Vec3;
  target: Vec3;
  fov: number;
};
