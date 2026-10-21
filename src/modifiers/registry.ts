import type {
  BuoyancyModifier,
  DisplacerModifier,
  ModifierKind,
  ObjectModifier,
} from "./domain/authored-modifier";
import type { SceneObject } from "../scene/domain/scene-object";
import type { PrimitiveKind } from "../scene/domain/scene-values";
import { createAuthoredId } from "../identity/authored-id";

export type ModifierDescriptor = {
  type: ModifierKind;
  label: string;
  shortLabel: string;
  description: string;
  allowedPrimitives: (primitive: PrimitiveKind) => boolean;
};

const floatingPrimitive = (primitive: PrimitiveKind): boolean =>
  primitive !== "camera" && primitive !== "water";

const meshPrimitive = (primitive: PrimitiveKind): boolean =>
  primitive !== "camera" &&
  primitive !== "water" &&
  primitive !== "cloner" &&
  primitive !== "particle" &&
  primitive !== "transform";

export const modifierRegistry: ModifierDescriptor[] = [
  {
    type: "buoyancy",
    label: "Buoyancy",
    shortLabel: "Float",
    description: "Sample the ocean under one or more pins and float this object on the surface.",
    allowedPrimitives: floatingPrimitive,
  },
  {
    type: "displacer",
    label: "Displacer",
    shortLabel: "Disp",
    description: "GPU-side normal displacement from procedural noise or an image texture.",
    allowedPrimitives: meshPrimitive,
  },
];

function makeId(prefix: string): string {
  return createAuthoredId(prefix);
}

function createBuoyancyModifier(object: SceneObject): BuoyancyModifier {
  const existing = (object.modifiers ?? []).filter((modifier) => modifier.type === "buoyancy").length;
  const width = Math.max(0.35, Math.min(0.85, 0.5 / Math.max(Math.abs(object.scale[0]), 0.001)));
  const depth = Math.max(0.35, Math.min(0.85, 0.5 / Math.max(Math.abs(object.scale[2]), 0.001)));
  const y = -0.35;
  return {
    id: makeId("mod-buoyancy"),
    type: "buoyancy",
    name: existing > 0 ? `Buoyancy ${existing + 1}` : "Buoyancy",
    enabled: true,
    verticalOffset: 0,
    damping: 0.18,
    followTilt: true,
    tiltStrength: 0.75,
    maxTiltDeg: 18,
    showPinGizmos: true,
    pinGizmoScale: 1,
    pins: [
      { id: makeId("pin"), name: "Bow", localOffset: [width, y, 0] },
      { id: makeId("pin"), name: "Stern", localOffset: [-width, y, 0] },
      { id: makeId("pin"), name: "Port", localOffset: [0, y, depth] },
      { id: makeId("pin"), name: "Starboard", localOffset: [0, y, -depth] },
    ],
  };
}

function createDisplacerModifier(object: SceneObject): DisplacerModifier {
  const existing = (object.modifiers ?? []).filter((modifier) => modifier.type === "displacer").length;
  return {
    id: makeId("mod-displacer"),
    type: "displacer",
    name: existing > 0 ? `Displacer ${existing + 1}` : "Displacer",
    enabled: true,
    strength: 0.035,
    midlevel: 0.5,
    heightClamp: 0.18,
    direction: "normal",
    source: "noise",
    noiseScale: 2.4,
    noiseDetail: 0.35,
    noiseContrast: 1.15,
    noiseSeed: 0,
    textureChannel: "luminance",
    textureInfluence: 1,
    uvScale: [1, 1],
    uvOffset: [0, 0],
    bumpEnabled: false,
    bumpStrength: 0.08,
    cameraFade: true,
    cameraNear: 8.8,
    cameraFar: 1,
  };
}

export function createModifier(type: ModifierKind, object: SceneObject): ObjectModifier {
  if (type === "buoyancy") return createBuoyancyModifier(object);
  if (type === "displacer") return createDisplacerModifier(object);
  const _exhaustive: never = type;
  return _exhaustive;
}

export function createBuoyancyPin(index: number): BuoyancyModifier["pins"][number] {
  return {
    id: makeId("pin"),
    name: `Pin ${index + 1}`,
    localOffset: [0, -0.35, 0],
  };
}

export function modifierDescriptor(type: ModifierKind): ModifierDescriptor {
  return modifierRegistry.find((item) => item.type === type) ?? modifierRegistry[0];
}

export function modifierLabel(modifier: ObjectModifier): string {
  return modifier.name || modifierDescriptor(modifier.type).shortLabel;
}
