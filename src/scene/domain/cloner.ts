import type { Vec3 } from "./scene-values";

export type ClonerMode = "linear" | "radial" | "grid" | "random" | "surface";
export type ClonerSourceMode = "iterate" | "random";
export type ClonerAxisMode = "unified" | "individual";
/** Clone orientation control shared by every distribution mode. */
export type ClonerAlignment = "default" | "none" | "path" | "outward" | "inward";
export type ClonerAlignmentAxis = "+z" | "-z" | "+y" | "-y" | "+x" | "-x";
export type ClonerAlignmentUp = "auto" | "x" | "y" | "z";
export type ClonerRadialPlane = "xy" | "xz" | "yz";

export type ClonerSettings = {
  enabled: boolean;
  mode: ClonerMode;
  sourceMode: ClonerSourceMode;
  inputObjectId?: string;
  count: number;
  seed: number;
  showSources: boolean;
  linearStep: Vec3;
  gridCount: Vec3;
  gridSpacing: Vec3;
  radius: number;
  arc: number;
  startAngle: number;
  alignRadial: boolean;
  alignToSurface: boolean;
  randomSize: Vec3;
  clonePosition: Vec3;
  cloneRotation: Vec3;
  cloneScale: Vec3;
  jitterPosition: Vec3;
  jitterPositionAxisMode: ClonerAxisMode;
  jitterRotation: Vec3;
  jitterRotationAxisMode: ClonerAxisMode;
  jitterScale: Vec3;
  jitterScaleAxisMode: ClonerAxisMode;
  gridCenter: boolean;
  linearRotation: Vec3; // degrees added per clone index
  linearScale: Vec3; // scale reached by the last clone, interpolated from one
  radialRings: number;
  radialCountStep: number;
  radialRadiusStep: number;
  radialRingTwist: number; // degrees per ring
  radialPlane: ClonerRadialPlane;
  radialAxisStep: number;
  radialCenterAxis: boolean;
  radialSpiralRadius: number;
  radialSpiralAxis: number;
  radialWaveCycles: number;
  radialWaveRadius: number;
  radialWaveAxis: number;
  radialWavePhase: number; // degrees
  radialWaveAxialPhase: number; // degrees
  radialWaveRingPhase: number; // degrees
  radialRotationOffset: Vec3; // degrees
  radialRotationStep: Vec3; // degrees per ring
  radialScaleStep: number;
  radialScaleWave: number;
  alignment: ClonerAlignment;
  alignmentAxis: ClonerAlignmentAxis;
  alignmentUp: ClonerAlignmentUp;
  uniformScale: number; // -1..1; zero collapses and negative values mirror
  effectorIds: string[]; // ordered scene-object IDs
};
