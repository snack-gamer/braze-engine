import type { Vec3 } from "./scene-values";

export type MotionPulseEasing = "linear" | "smooth" | "easeIn" | "easeOut" | "easeInOut";
export type MotionPulseMode = "loop" | "restart" | "yoyo" | "pulse";
export type MotionPulseAxisMode = "individual" | "unified";

export type MotionPulseTarget = {
  id: string;
  objectId?: string;
  name: string;
  enabled: boolean;
  mode: MotionPulseMode;
  axisMode: MotionPulseAxisMode;
  rate: number;
  phase: number;
  easing: MotionPulseEasing;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

export type MotionPulseComponent = {
  enabled: boolean;
  targets: MotionPulseTarget[];
};
