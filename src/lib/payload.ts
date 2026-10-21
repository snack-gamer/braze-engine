import { defaultCameraSettings } from "../constants";
import {
  DEFAULT_OBJECT_COLOR,
  type PrimitiveKind,
  type SceneObject,
} from "../types";
import { primitiveLabel } from "./format";
import { defaultWaterSettings } from "../water/settings";
import { defaultClonerSettings } from "./cloner";
import { defaultEffectorSettings } from "./effector";
import { defaultParticleEffectSettings } from "../particles/settings";
import { decodeSceneJson } from "../scene/serialization/scene-codec";
import { DEFAULT_DIRECTIONAL_LIGHT_SETTINGS } from "../scene/domain/directional-light";
import { createAuthoredId } from "../identity/authored-id";

export function makeObject(kind: PrimitiveKind, index: number, asset?: Partial<SceneObject>): SceneObject {
  const base: SceneObject = {
    id: createAuthoredId("obj"),
    name: asset?.assetName ? asset.assetName.replace(/\.[^.]+$/, "") : `${primitiveLabel(kind)} ${index + 1}`,
    primitive: kind === "water" ? "plane" : kind,
    color: DEFAULT_OBJECT_COLOR,
    visible: true,
    locked: false,
    position: [index * 0.45 - 0.4, kind === "plane" || kind === "water" ? 0 : 0.8, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
  if (kind === "camera") {
    base.camera = { ...defaultCameraSettings };
    base.position = [5.6, 4.2, 6.4];
  } else if (kind === "directionalLight") {
    base.name = "Directional Light";
    base.position = [0, 3, 0];
    base.rotation = [50, -30, 0];
    base.renderVisible = false;
    base.color = DEFAULT_DIRECTIONAL_LIGHT_SETTINGS.color;
    base.directionalLight = { ...DEFAULT_DIRECTIONAL_LIGHT_SETTINGS };
  } else if (kind === "transform") {
    base.name = `Transform ${index + 1}`;
    base.position = [0, 0, 0];
    base.renderVisible = false;
  } else if (kind === "water") {
    base.name = "Ocean";
    base.position = [0, -0.2, 0];
    base.scale = [8, 1, 8];
    base.water = defaultWaterSettings;
  } else if (kind === "cloner") {
    base.name = `Cloner ${index + 1}`;
    base.position = [0, 0, 0];
    base.cloner = { ...defaultClonerSettings };
  } else if (kind === "effector") {
    base.name = `Effector ${index + 1}`;
    base.position = [0, 0, 0];
    base.renderVisible = false;
    base.effector = { ...defaultEffectorSettings };
  } else if (kind === "particle") {
    base.name = `Particles ${index + 1}`;
    base.position = [0, 0, 0];
    base.particle = { ...defaultParticleEffectSettings };
  }
  return { ...base, ...asset };
}

export function parseSceneJson(text: string): SceneObject[] {
  return decodeSceneJson(text).objects;
}
