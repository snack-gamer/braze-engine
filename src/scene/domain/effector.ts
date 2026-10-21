import type { Vec3 } from "./scene-values";

export type EffectorType = "random" | "step" | "target" | "shader" | "pushApart";
export type EffectorShape =
  | "infinite"
  | "sphere"
  | "box"
  | "capsule"
  | "cylinder"
  | "cone"
  | "torus"
  | "plane";
export type EffectorTransformSpace = "world" | "effector";
export type EffectorAimAxis = "+z" | "-z" | "+y" | "-y" | "+x" | "-x";

/** A cubic Hermite key with explicit tangents. */
export type EffectorCurveKey = {
  time: number;
  value: number;
  inTangent: number;
  outTangent: number;
};

export type EffectorSettings = {
  enabled: boolean;
  type: EffectorType;
  shape: EffectorShape;
  radius: number;
  boxSize: Vec3;
  height: number;
  torusMajorRadius: number;
  torusMinorRadius: number;
  planeSize: [number, number];
  planeThickness: number;
  falloff: EffectorCurveKey[];
  strength: number;
  transformSpace: EffectorTransformSpace;
  affectPosition: boolean;
  positionAmount: Vec3;
  affectRotation: boolean;
  rotationAmount: Vec3; // degrees
  affectScale: boolean;
  scaleAmount: Vec3;
  uniformScale: boolean;
  randomMode: "random" | "gaussian" | "noise" | "turbulence";
  seed: number;
  outputRange: [number, number];
  synchronized: boolean;
  indexed: boolean;
  noiseSpace: "global" | "object";
  noiseSize: number;
  animationSpeed: number;
  stepOrdering: "index" | "objectX" | "objectY" | "objectZ" | "radial";
  stepInputRange: [number, number];
  stepCurve: EffectorCurveKey[];
  stepOffset: number;
  stepLoop: boolean;
  stepReverse: boolean;
  stepQuantize: number;
  targetObjectId?: string;
  aimAxis: EffectorAimAxis;
  usePitch: boolean;
  upMode: "world" | "effector" | "target" | "custom";
  customUp: Vec3;
  repel: boolean;
  repelDistance: number;
  repelStrength: number;
  shaderNoiseType: "soft" | "fractal" | "turbulence" | "ridged";
  shaderNoiseSpace: "effector" | "object" | "world";
  globalScale: number;
  relativeScale: Vec3;
  coordinateOffset: Vec3;
  octaves: number;
  roughness: number;
  lacunarity: number;
  evolutionSpeed: number;
  movement: Vec3;
  movementSpeed: number;
  lowClip: number;
  highClip: number;
  brightness: number;
  contrast: number;
  absolute: boolean;
  invert: boolean;
  remapCurve: EffectorCurveKey[];
  pushDirection: "all" | "x" | "y" | "z";
  separationRadius: number;
  iterations: number;
};
