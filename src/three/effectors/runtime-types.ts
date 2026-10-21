import type * as THREE from "three";
import type { EffectorSettings } from "../../types";
import type { V3, V4 } from "./math";

export type EffectorRuntime = {
  settings: EffectorSettings;
  position: V3;
  rotation: V4;
  boxHalf: V3;
  radius: number;
  falloffLut: Float32Array;
  functionLut: Float32Array;
  targetPosition: V3;
  targetUp: V3;
};

export type EffectorContext = {
  time: number;
  objectWorldToLocal: THREE.Matrix4;
  objectRotation: V4;
  boundsMin: V3;
  boundsMax: V3;
  instanceCount: number;
};

export type EffectorInstanceState = {
  position: V3;
  rotation: V4;
  scale: V3;
};

export type EffectorSamples = {
  position: V3;
  rotation: V3;
  scale: V3;
};
