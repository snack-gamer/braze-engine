import type { AssetRef } from "../../assets/domain/asset-reference";
import type { BehaviorComponent } from "../../behaviors/domain/behavior-component";
import type { UiCanvasComponent } from "../../game-ui/domain/ui-document";
import type { AnimatorComponent } from "../../character/domain/animator-component";
import type { CharacterControllerComponent } from "../../character-controller/domain/character-controller";
import type { JointComponent } from "../../physics/domain/joint";
import type { ObjectModifier } from "../../modifiers/domain/authored-modifier";
import type { ParticleEffectSettings } from "../../particles/domain/particle-effect";
import type {
  ColliderComponent,
  RigidbodyComponent,
} from "../../physics/domain/components";
import type { WaterSettings } from "../../water/types";
import type { CameraSettings, DepthOfFieldComponent } from "./camera";
import type { ClonerSettings } from "./cloner";
import type { DirectionalLightSettings } from "./directional-light";
import type { EffectorSettings } from "./effector";
import type { MotionPulseComponent } from "./motion-pulse";
import type { PrefabLink } from "./prefab-link";
import type {
  AnimationPlayerComponent,
  MeshFilterComponent,
  MeshRendererComponent,
  WireframeComponent,
} from "./render-components";
import type { PrimitiveKind, Vec3 } from "./scene-values";
import type { SpriteRendererComponent } from "./sprite-renderer";

type ImportedMaterialBinding = {
  slotKey: string;
  materialId: string;
  sourceName?: string;
};

/** The authored, persisted aggregate for one scene hierarchy object. */
export type SceneObject = {
  id: string;
  name: string;
  /** Case-sensitive entity labels; absent means untagged. */
  tags?: readonly string[];
  primitive: PrimitiveKind;
  /** Undefined is treated as `3d` for backward compatibility. */
  dimension?: "2d" | "3d";
  color: string;
  visible: boolean;
  locked: boolean;
  transformLocked?: boolean;
  solo?: boolean;
  wireframe?: WireframeComponent;
  renderVisible?: boolean;
  rowColor?: string;
  rowColorEnabled?: boolean;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  assetName?: string;
  assetRef?: AssetRef;
  assetUrl?: string;
  assetNote?: string;
  assetMissing?: boolean;
  botProfileId?: string;
  /** Undefined denotes a hierarchy root; transforms inherit from this parent. */
  parentId?: string;
  materialId?: string;
  importedMaterialBindings?: ImportedMaterialBinding[];
  meshFilter?: MeshFilterComponent;
  meshRenderer?: MeshRendererComponent;
  spriteRenderer?: SpriteRendererComponent;
  /** Default components explicitly removed by the author. */
  removedComponents?: string[];
  water?: WaterSettings;
  cloner?: ClonerSettings;
  effector?: EffectorSettings;
  particle?: ParticleEffectSettings;
  camera?: CameraSettings;
  directionalLight?: DirectionalLightSettings;
  modifiers?: ObjectModifier[];
  /** Gameplay state-machine animation; independent from timeline authoring. */
  animator?: AnimatorComponent;
  /** Registered project behaviors and their authored field values. */
  behaviors?: BehaviorComponent;
  /** Responsive screen-space UI; node IDs are local to this canvas. */
  uiCanvas?: UiCanvasComponent;
  /** Kinematic collision/motor ownership for a playable character root. */
  characterController?: CharacterControllerComponent;
  /** Opt-in editor timeline authoring for this hierarchy. */
  animationPlayer?: AnimationPlayerComponent;
  depthOfField?: DepthOfFieldComponent;
  motionPulse?: MotionPulseComponent;
  rigidbody?: RigidbodyComponent;
  colliders?: ColliderComponent[];
  joint?: JointComponent;
  prefabLink?: PrefabLink;
};
