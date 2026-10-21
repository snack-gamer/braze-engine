// Compatibility surface for callers that have not yet moved to feature-owned
// domain imports. This barrel intentionally contains no type definitions or
// behavior; canonical contracts live with the features that own them.
export type { AssetRef } from "./assets/domain/asset-reference";
export type { CharacterControllerComponent } from "./character-controller/domain/character-controller";
export type { EditorPrefs } from "./editor/domain/editor-preferences";
export {
  GRID_HORIZON_MAX,
  GRID_HORIZON_MIN,
} from "./editor/domain/editor-preferences";
export type { InspectorTarget } from "./editor/domain/inspector-target";
export type { Material } from "./materials/domain/material";
export type {
  BuoyancyModifier,
  BuoyancyPin,
  DisplacerModifier,
  ModifierKind,
  ModifierPinSelection,
  ObjectModifier,
} from "./modifiers/domain/authored-modifier";
export type {
  ParticleEffectSettings,
  ParticlePresetKind,
} from "./particles/domain/particle-effect";
export type {
  ColliderAxis,
  ColliderComponent,
  ColliderShape,
  RigidbodyBodyType,
  RigidbodyComponent,
  RigidbodyInterpolation,
  RigidbodyMassMode,
} from "./physics/domain/components";
export type { PhysicsWorldSettings } from "./physics/domain/world-settings";
export type {
  EnvironmentSettings,
  SkySettings,
  ToneMapping,
  WorldSource,
} from "./rendering/domain/environment-settings";
export type {
  AmbientOcclusionSettings,
  ScreenSpaceReflectionSettings,
} from "./rendering/domain/gi-settings";
export type {
  CameraSettings,
  CameraState,
  DepthOfFieldComponent,
} from "./scene/domain/camera";
export type {
  ClonerAlignment,
  ClonerAlignmentAxis,
  ClonerAlignmentUp,
  ClonerAxisMode,
  ClonerMode,
  ClonerRadialPlane,
  ClonerSettings,
  ClonerSourceMode,
} from "./scene/domain/cloner";
export type { DirectionalLightSettings } from "./scene/domain/directional-light";
export type {
  EffectorAimAxis,
  EffectorCurveKey,
  EffectorSettings,
  EffectorShape,
  EffectorTransformSpace,
  EffectorType,
} from "./scene/domain/effector";
export type {
  MotionPulseAxisMode,
  MotionPulseComponent,
  MotionPulseEasing,
  MotionPulseMode,
  MotionPulseTarget,
} from "./scene/domain/motion-pulse";
export type {
  PrefabLink,
  PrefabOverrideKey,
} from "./scene/domain/prefab-link";
export type { WireframeComponent } from "./scene/domain/render-components";
export type { SceneObject } from "./scene/domain/scene-object";
export { DEFAULT_OBJECT_COLOR } from "./scene/domain/scene-values";
export type {
  PrimitiveKind,
  ScenePlaybackMode,
  TransformMode,
  TransformSpace,
  Vec3,
} from "./scene/domain/scene-values";
export type {
  SpriteDrawMode,
  SpriteMaskInteraction,
  SpriteRendererComponent,
  SpriteSortPoint,
} from "./scene/domain/sprite-renderer";
