import { decodeJoint } from "../../physics/serialization/joint-codec";
import {
  defaultCameraSettings,
  defaultDepthOfFieldComponent,
} from "../../constants";
import { decodeAnimatorComponent } from "../../character/serialization/animator-component-codec";
import { decodeBehaviorComponent } from "../../behaviors/serialization/behavior-component-codec";
import { decodeUiCanvas } from "../../game-ui/serialization/ui-canvas-codec";
import { decodeCharacterController } from "../../character-controller/serialization/character-controller-codec";
import {
  defaultParticleEffectSettings,
  normalizeParticleEffectSettings,
} from "../../particles/settings";
import { parsePhysicsComponents } from "../../physics/serialization/codec";
import type { CameraSettings, DepthOfFieldComponent } from "../domain/camera";
import type { DirectionalLightSettings } from "../domain/directional-light";
import type { SceneObject } from "../domain/scene-object";
import { captureEntityTags } from "../../world/domain/entity-tags";
import {
  DEFAULT_OBJECT_COLOR,
  type PrimitiveKind,
  type Vec3,
} from "../domain/scene-values";
import { parseModifiers } from "../../modifiers/serialization";
import { parseWaterSettings } from "../../water/serialization";
import { defaultWaterSettings } from "../../water/settings";
import { defaultClonerSettings, parseClonerSettings } from "../../lib/cloner";
import {
  DEFAULT_DIRECTIONAL_LIGHT_SETTINGS,
  normalizeDirectionalLightSettings,
} from "../domain/directional-light";
import { defaultEffectorSettings, parseEffectorSettings } from "../../lib/effector";
import { parseMotionPulseComponent } from "../../lib/motion-pulse";
import { parsePrefabLink } from "../../lib/prefab-link";
import { parseSpriteRenderer } from "./sprite-renderer-codec";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function vec3(value: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(value)) return [...fallback];
  return [
    finiteNumber(value[0], fallback[0]),
    finiteNumber(value[1], fallback[1]),
    finiteNumber(value[2], fallback[2]),
  ];
}

function scaleVec3(value: unknown): Vec3 {
  const parsed = vec3(value, [1, 1, 1]);
  return parsed.map((entry) => Math.max(0.001, Math.abs(entry))) as Vec3;
}

function parseAssetRef(raw: unknown): SceneObject["assetRef"] | undefined {
  const value = record(raw);
  if (!value) return undefined;
  const guid = typeof value.guid === "string" ? value.guid.toLowerCase() : "";
  if (!/^[a-f0-9]{32}$/.test(guid)) return undefined;
  const localId = value.local_id ?? value.localId;
  return {
    guid,
    localId: typeof localId === "string" ? localId : undefined,
  };
}

function parseCameraSettings(raw: unknown): CameraSettings | undefined {
  const value = record(raw);
  if (!value) return undefined;
  return {
    target: vec3(value.target, defaultCameraSettings.target),
    fov: finiteNumber(value.fov_degrees, defaultCameraSettings.fov),
    near: finiteNumber(value.near, defaultCameraSettings.near),
    far: finiteNumber(value.far, defaultCameraSettings.far),
  };
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseDepthOfField(raw: unknown): DepthOfFieldComponent | undefined {
  const value = record(raw);
  if (!value) return undefined;
  return {
    enabled: value.enabled !== false,
    mode: value.mode === "auto" ? "auto" : "manual",
    focusDistance: finiteNumber(value.focus_distance, defaultDepthOfFieldComponent.focusDistance),
    fStop: finiteNumber(value.f_stop, defaultDepthOfFieldComponent.fStop),
    targetObjectId: typeof value.target_object_id === "string" ? value.target_object_id : undefined,
    autoFocusWidth: finiteNumber(
      value.auto_focus_width,
      defaultDepthOfFieldComponent.autoFocusWidth,
    ),
    autoBlurStrength: finiteNumber(
      value.auto_blur_strength,
      defaultDepthOfFieldComponent.autoBlurStrength,
    ),
    focusRange: optionalFiniteNumber(value.focus_range ?? value.focusRange),
  };
}

function parseDirectionalLight(raw: unknown): DirectionalLightSettings | undefined {
  return record(raw) ? normalizeDirectionalLightSettings(raw) : undefined;
}

function parseImportedMaterialBindings(
  raw: unknown,
): SceneObject["importedMaterialBindings"] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const bindings = raw.flatMap((item) => {
    const value = record(item);
    const slotKey = value && typeof value.slotKey === "string" ? value.slotKey : "";
    const materialId = value && typeof value.materialId === "string" ? value.materialId : "";
    if (!slotKey || !materialId) return [];
    return [{
      slotKey,
      materialId,
      sourceName: typeof value?.sourceName === "string" ? value.sourceName : undefined,
    }];
  });
  return bindings.length > 0 ? bindings : undefined;
}

function parseMeshFilter(raw: unknown): SceneObject["meshFilter"] | undefined {
  const value = record(raw);
  return value ? { enabled: value.enabled !== false } : undefined;
}

function parseMeshRenderer(raw: unknown): SceneObject["meshRenderer"] | undefined {
  const value = record(raw);
  if (!value) return undefined;
  const out: NonNullable<SceneObject["meshRenderer"]> = {};
  if (value.enabled === false) out.enabled = false;
  const castShadows = value.cast_shadows ?? value.castShadows;
  const receiveShadows = value.receive_shadows ?? value.receiveShadows;
  if (typeof castShadows === "boolean") out.castShadows = castShadows;
  if (typeof receiveShadows === "boolean") out.receiveShadows = receiveShadows;
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseWireframe(raw: unknown): SceneObject["wireframe"] | undefined {
  if (typeof raw === "boolean") return raw ? { enabled: true } : undefined;
  const value = record(raw);
  return value ? { enabled: value.enabled !== false } : undefined;
}

function parseDimension(value: unknown): SceneObject["dimension"] {
  return value === "2d" || value === "3d" ? value : undefined;
}

function parsePrimitive(value: unknown): { source: PrimitiveKind; runtime: PrimitiveKind } {
  const source = (typeof value === "string" ? value : "cube") as PrimitiveKind;
  return { source, runtime: source === "water" ? "plane" : source };
}

export function parseSceneObjects(rawObjects: unknown[]): SceneObject[] {
  return rawObjects.map((raw, index): SceneObject => {
    const item = raw as Record<string, unknown>;
    const { source, runtime: primitive } = parsePrimitive(item.source_type);
    const id = typeof item.id === "string" && item.id ? item.id : `imported-${index}`;
    const water = parseWaterSettings(item.water_settings)
      ?? (source === "water" ? defaultWaterSettings : undefined);
    const asset = record(item.asset);
    const camera = parseCameraSettings(item.camera);
    const directionalLight = parseDirectionalLight(item.directional_light);
    return {
      id,
      name: typeof item.name === "string" && item.name ? item.name : `Object ${index + 1}`,
      tags: item.tags === undefined ? undefined : captureEntityTags(item.tags),
      primitive,
      dimension: parseDimension(item.dimension),
      parentId: typeof item.parent_id === "string" ? item.parent_id : undefined,
      color: typeof item.color === "string" ? item.color : DEFAULT_OBJECT_COLOR,
      visible: item.visible !== false,
      locked: item.locked === true,
      transformLocked: item.transform_locked === true,
      solo: item.solo === true,
      wireframe: parseWireframe(item.wireframe),
      removedComponents: Array.isArray(item.removed_components)
        ? item.removed_components.filter((entry): entry is string => typeof entry === "string")
        : undefined,
      renderVisible: item.render_visible !== false,
      rowColor: typeof item.row_color === "string" ? item.row_color : undefined,
      rowColorEnabled: item.row_color_enabled === true,
      position: vec3(record(item.transform)?.position, [0, 0, 0]),
      rotation: vec3(record(item.transform)?.rotation_degrees, [0, 0, 0]),
      scale: scaleVec3(record(item.transform)?.scale),
      assetName: typeof asset?.name === "string" ? asset.name : undefined,
      assetRef: parseAssetRef(asset?.ref),
      assetUrl: typeof asset?.url === "string" ? asset.url : undefined,
      assetNote: typeof asset?.note === "string" ? asset.note : undefined,
      assetMissing: asset?.missing === true,
      botProfileId: typeof item.bot_profile_id === "string" ? item.bot_profile_id : undefined,
      camera: primitive === "camera" ? camera ?? { ...defaultCameraSettings } : camera,
      directionalLight: primitive === "directionalLight"
        ? directionalLight ?? { ...DEFAULT_DIRECTIONAL_LIGHT_SETTINGS }
        : directionalLight,
      materialId: primitive !== "camera" && typeof item.material_id === "string"
        ? item.material_id
        : undefined,
      importedMaterialBindings: primitive === "camera"
        ? undefined
        : parseImportedMaterialBindings(item.imported_material_bindings),
      meshFilter: parseMeshFilter(item.mesh_filter),
      meshRenderer: parseMeshRenderer(item.mesh_renderer),
      spriteRenderer: parseSpriteRenderer(item.sprite_renderer),
      water,
      cloner: primitive === "cloner"
        ? parseClonerSettings(item.cloner) ?? { ...defaultClonerSettings }
        : parseClonerSettings(item.cloner),
      effector: primitive === "effector"
        ? parseEffectorSettings(item.effector) ?? { ...defaultEffectorSettings }
        : parseEffectorSettings(item.effector),
      particle: primitive === "particle" || item.particle_effect
        ? normalizeParticleEffectSettings(item.particle_effect ?? defaultParticleEffectSettings)
        : undefined,
      modifiers: parseModifiers(item.modifiers),
      animator: record(item.animator) ? decodeAnimatorComponent(item.animator) : undefined,
      behaviors: decodeBehaviorComponent(item.behaviors),
      uiCanvas: decodeUiCanvas(item.ui_canvas),
      joint: decodeJoint(item.joint),
      characterController: decodeCharacterController(item.character_controller ?? item.characterController),
      animationPlayer: record(item.animation_player)
        ? { enabled: record(item.animation_player)?.enabled !== false }
        : undefined,
      depthOfField: primitive === "camera" ? parseDepthOfField(item.depth_of_field) : undefined,
      motionPulse: parseMotionPulseComponent(item.motion_pulse),
      ...parsePhysicsComponents(item, { id, primitive }),
      prefabLink: parsePrefabLink(item.prefab_link),
    };
  });
}
