import type { Vec3 } from "../../scene/domain/scene-values";

export type ModifierKind = "buoyancy" | "displacer";

export type BuoyancyPin = {
  id: string;
  name: string;
  localOffset: Vec3;
};

export type BuoyancyModifier = {
  id: string;
  type: "buoyancy";
  name: string;
  enabled: boolean;
  pins: BuoyancyPin[];
  verticalOffset: number;
  damping: number;
  followTilt: boolean;
  tiltStrength: number;
  maxTiltDeg: number;
  showPinGizmos: boolean;
  pinGizmoScale: number;
  waterObjectId?: string;
};

export type DisplacerModifier = {
  id: string;
  type: "displacer";
  name: string;
  enabled: boolean;
  strength: number;
  midlevel: number;
  heightClamp: number;
  direction: "normal" | "y";
  source: "noise" | "texture" | "blend";
  noiseScale: number;
  noiseDetail: number;
  noiseContrast: number;
  noiseSeed: number;
  textureUrl?: string;
  textureName?: string;
  textureFilename?: string;
  textureFlipY?: boolean;
  textureChannel: "luminance" | "red" | "green" | "blue" | "alpha";
  textureInfluence: number;
  uvScale: [number, number];
  uvOffset: [number, number];
  bumpEnabled: boolean;
  bumpStrength: number;
  cameraFade: boolean;
  cameraNear: number;
  cameraFar: number;
};

export type ObjectModifier = BuoyancyModifier | DisplacerModifier;

export type ModifierPinSelection = {
  objectId: string;
  modifierId: string;
  pinId: string;
};
