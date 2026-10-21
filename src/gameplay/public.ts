export type {
  GameModule, GameContext, GameInstance, GameTick, GameFrame,
  GameEntity, GameEvent, GameEventPort, GameCameraPose, GameVec3, GameCharacterResult,
} from "./domain/game-module";
export type { GameInput, InputActionMap, InputAction, InputBinding, InputActionState } from "../input/domain/action-map";
export { decodeInputActionMap, encodeInputActionMap } from "../input/serialization/action-map-codec";
export { createFollowCamera } from "../camera/runtime/follow-camera";
export type { FollowCameraSettings } from "../camera/runtime/follow-camera";
export { createCharacterLocomotion } from "../character-controller/runtime/character-locomotion";
export type { CharacterLocomotionSettings } from "../character-controller/runtime/character-locomotion";
export type { EntityHandle, WorldEntity, EntityWorld, EntityCommand, EntityBatch, EntityBatchState, EntityWorldStats, EntityErrorCode } from "../world/domain/entity-world";
export { EntityWorldError } from "../world/domain/entity-world";
export type { RuntimePrimitive, RuntimeVector3 } from "../world/domain/runtime-primitive";
export type { RuntimePrimitiveShape, RuntimePrimitivePhysics } from "../world/domain/runtime-primitive";
export type { EntityTransform } from "../world/domain/entity-transform";
export type { RuntimePrefabs, PrefabInstance, PrefabBatch, PrefabBatchState, PrefabPlacement } from "../prefabs/domain/runtime-prefab";
export type { AssetRef } from "../assets/domain/asset-reference";
export type { PrefabPool, PrefabPoolStats } from "../prefabs/domain/prefab-pool";
export type { EntityTagQuery } from "../world/domain/entity-tags";
export type {
  EntityBehaviors, EntityBehaviorDefinition, EntityBehaviorScope, EntityBehaviorInstance,
  EntityBehaviorAttachment, EntityBehaviorState, EntityBehaviorStats, EntityBehaviorDiagnostic,
  EntityBehaviorDisposeReason, EntityBehaviorTick,
} from "../behaviors/domain/entity-behaviors";
export { EntityBehaviorError, ENTITY_BEHAVIOR_LIMITS } from "../behaviors/domain/entity-behaviors";

export type { BehaviorComponent, BehaviorEntry, BehaviorValue, BehaviorValues, BehaviorEntityReference } from "../behaviors/domain/behavior-component";
export type { BehaviorRegistration, BehaviorField, RegisteredBehaviorScope } from "../behaviors/domain/behavior-registration";

export type { GameAnimation, GameAnimationEvent, GameAnimationSnapshot } from "./domain/game-animation";

export type { RuntimeModel } from "../world/domain/runtime-model";
export type { RuntimeCharacter, RuntimeCharacterPhysics } from "../character-controller/domain/runtime-character";
export { captureRuntimeCharacter } from "../character-controller/domain/runtime-character";
export type { GameCharacters, GameCharacterPose, GameCharacterMoveOptions, GameCharacterMovementLease } from "../character-controller/domain/game-character-commands";
export type { GameCamera, GameCameraLease } from "../camera/domain/game-camera";
export { createStockControlInputMap } from "../input/domain/stock-control-input-map";
export { createFirstPersonControl, createThirdPersonControl, createTopDownControl } from "../character-controller/runtime/stock-character-controls";
export { createCharacterControlPolicy, faceCharacterView, faceCharacterMovement } from "../character-controller/runtime/character-control-policy";
export type { CharacterControlPorts, CharacterControlFacing } from "../character-controller/runtime/character-control-policy";
export { createCharacterControlLook } from "../character-controller/runtime/character-control-look";
export type { CharacterControlLookInput, CharacterControlOrientation } from "../character-controller/runtime/character-control-look";
export type { CharacterControlActions, CharacterControlLookSettings, CharacterControlSettings } from "../character-controller/domain/character-control-settings";
export type { StockCharacterControlSettings, StockCharacterControlOptions } from "../character-controller/domain/stock-character-control-settings";
export { createFirstPersonCamera, createThirdPersonCamera, createTopDownCamera } from "../camera/runtime/stock-camera-policies";
export type { CameraPolicy, CameraConstraint, CameraPolicyOrientation, StockCameraSettings } from "../camera/domain/stock-camera-policy";
export { ScriptBehavior, defineBehavior, defineGame } from "../scripting/domain/script-behavior";
export type { ScriptBehaviorConstructor, ScriptBehaviorMetadata } from "../scripting/domain/script-behavior";
export type { GameUi, UiScreen, UiAction, UiTween, UiTweenOptions, UiTweenValues, UiDocument, UiNode, UiStyle, UiLength, UiKind, UiPatch } from "../game-ui/domain/game-ui";
export { createUiCanvas, UI_LIMITS } from "../game-ui/domain/ui-document";
