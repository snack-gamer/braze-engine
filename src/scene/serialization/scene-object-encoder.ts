import { encodeJoint } from "../../physics/serialization/joint-codec";
import { serializeModifiers } from "../../modifiers/serialization";
import { encodeAnimatorComponent } from "../../character/serialization/animator-component-codec";
import { encodeBehaviorComponent } from "../../behaviors/serialization/behavior-component-codec";
import { encodeUiCanvas } from "../../game-ui/serialization/ui-canvas-codec";
import { encodeCharacterController } from "../../character-controller/serialization/character-controller-codec";
import {
  serializeColliders,
  serializeRigidbody,
} from "../../physics/serialization/codec";
import type { SceneObject } from "../domain/scene-object";
import { captureEntityTags } from "../../world/domain/entity-tags";
import { serializeWaterSettings } from "../../water/serialization";
import { serializeClonerSettings } from "../../lib/cloner";
import { serializeEffectorSettings } from "../../lib/effector";
import { serializeMotionPulseComponent } from "../../lib/motion-pulse";
import { serializePrefabLink } from "../../lib/prefab-link";
import { serializeSpriteRenderer } from "./sprite-renderer-codec";

function serializedPrimitive(object: SceneObject): SceneObject["primitive"] {
  return object.primitive === "water" ? "plane" : object.primitive;
}

function serializeAsset(object: SceneObject) {
  const hasAsset = Boolean(
    object.assetName
    || object.assetRef
    || object.assetUrl
    || object.assetNote
    || object.assetMissing,
  );
  if (!hasAsset) return null;
  return {
    name: object.assetName ?? null,
    ref: object.assetRef
      ? { guid: object.assetRef.guid, local_id: object.assetRef.localId ?? "main" }
      : null,
    url: object.assetUrl ?? null,
    note: object.assetNote ?? null,
    missing: object.assetMissing === true,
  };
}

export function serializeSceneObject(object: SceneObject) {
  return {
    id: object.id,
    name: object.name,
    ...(object.tags === undefined ? {} : { tags: captureEntityTags(object.tags) }),
    source_type: serializedPrimitive(object),
    dimension: object.dimension ?? null,
    parent_id: object.parentId ?? null,
    color: object.color,
    visible: object.visible,
    locked: object.locked,
    transform_locked: object.transformLocked ?? false,
    solo: object.solo ?? false,
    wireframe: object.wireframe ? { enabled: object.wireframe.enabled !== false } : null,
    removed_components: object.removedComponents ?? null,
    render_visible: object.renderVisible !== false,
    row_color: object.rowColor ?? null,
    row_color_enabled: object.rowColorEnabled ?? false,
    transform: {
      position: object.position,
      rotation_degrees: object.rotation,
      scale: object.scale,
    },
    material_id: object.materialId ?? null,
    imported_material_bindings: object.importedMaterialBindings ?? null,
    mesh_filter: object.meshFilter ? { enabled: object.meshFilter.enabled !== false } : null,
    mesh_renderer: object.meshRenderer
      ? {
          enabled: object.meshRenderer.enabled !== false,
          cast_shadows: object.meshRenderer.castShadows ?? null,
          receive_shadows: object.meshRenderer.receiveShadows ?? null,
        }
      : null,
    sprite_renderer: serializeSpriteRenderer(object.spriteRenderer),
    prefab_link: serializePrefabLink(object.prefabLink),
    asset: serializeAsset(object),
    bot_profile_id: object.botProfileId ?? null,
    camera: object.camera
      ? {
          target: object.camera.target,
          fov_degrees: object.camera.fov,
          near: object.camera.near,
          far: object.camera.far,
        }
      : null,
    directional_light: object.directionalLight
      ? {
          enabled: object.directionalLight.enabled !== false,
          color: object.directionalLight.color,
          intensity: object.directionalLight.intensity,
          cast_shadows: object.directionalLight.castShadows,
        }
      : null,
    depth_of_field: object.depthOfField
      ? {
          enabled: object.depthOfField.enabled !== false,
          mode: object.depthOfField.mode,
          focus_distance: object.depthOfField.focusDistance,
          f_stop: object.depthOfField.fStop,
          target_object_id: object.depthOfField.targetObjectId ?? null,
          auto_focus_width: object.depthOfField.autoFocusWidth,
          auto_blur_strength: object.depthOfField.autoBlurStrength,
          focus_range: object.depthOfField.focusRange ?? null,
        }
      : null,
    water_settings: serializeWaterSettings(object.water),
    cloner: serializeClonerSettings(object.cloner),
    effector: serializeEffectorSettings(object.effector),
    particle_effect: object.particle ?? null,
    modifiers: serializeModifiers(object.modifiers),
    animator: object.animator ? encodeAnimatorComponent(object.animator) : null,
    behaviors: encodeBehaviorComponent(object.behaviors),
    ui_canvas: encodeUiCanvas(object.uiCanvas),
    joint: encodeJoint(object.joint),
    character_controller: encodeCharacterController(object.characterController),
    animation_player: object.animationPlayer
      ? { enabled: object.animationPlayer.enabled !== false }
      : null,
    motion_pulse: serializeMotionPulseComponent(object.motionPulse),
    rigidbody: serializeRigidbody(object.rigidbody),
    colliders: serializeColliders(object.colliders),
  };
}
