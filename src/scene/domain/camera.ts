import type { Vec3 } from "./scene-values";

export type CameraSettings = {
  target: Vec3;
  fov: number;
  near: number;
  far: number;
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
