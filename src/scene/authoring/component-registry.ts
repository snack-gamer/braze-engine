import { defaultJoint } from "../../physics/domain/joint";
import { createUiCanvas } from "../../game-ui/domain/ui-document";
import { addBehaviorComponent } from "../../behaviors/application/behavior-authoring";
import { defaultDepthOfFieldComponent } from "../../constants";
import { createDefaultAnimatorComponent } from "../../character/domain/animator-component";
import {
  characterControllerUnavailableReason,
  createCharacterControllerPatch,
} from "../../character-controller/application/character-controller-authoring";
import { isComponentRemoved, isMeshRenderObject, restoreComponentPatch } from "../../lib/components";
import { createMotionPulseComponent } from "../../lib/motion-pulse";
import { createModifier, modifierRegistry } from "../../modifiers/registry";
import {
  defaultColliderForObject,
  defaultRigidbodyForObject,
} from "../../physics/authoring/component-defaults";
import type { ModifierKind, SceneObject } from "../../types";
import { defaultWaterSettings } from "../../water/settings";
import {
  animatorComponentUnavailableReason,
  type AnimatorImportedAssetCatalog,
} from "./animator-component-eligibility";

export type AddableComponentKind =
  | "uiCanvas"
  | "behaviors"
  | "animator"
  | "characterController"
  | "animationPlayer"
  | "depthOfField"
  | "motionPulse"
  | "joint"
  | "rigidbody"
  | "collider"
  | "waterSurface";

export type SceneComponentAdditionId =
  | AddableComponentKind
  | "meshFilter"
  | "meshRenderer"
  | "spriteRenderer"
  | "wireframe"
  | `modifier:${ModifierKind}`;

export type SceneComponentOperation = {
  id: SceneComponentAdditionId;
  disabledReason: (
    object: SceneObject,
    context?: Readonly<{ animatorCatalog?: AnimatorImportedAssetCatalog }>,
  ) => string | undefined;
  createPatch: (object: SceneObject) => Partial<SceneObject>;
};

const OPTIONAL_COMPONENT_OPERATIONS: SceneComponentOperation[] = [
  { id: "uiCanvas", disabledReason: (object) => object.uiCanvas ? "This object already has a UI Canvas." : object.primitive === "camera" ? "Attach UI Canvas to a Transform or ordinary scene object." : undefined,
    createPatch: () => ({ uiCanvas: createUiCanvas() }) },
  { id: "behaviors", disabledReason: (object) => object.behaviors ? "This object already has Behaviors." : undefined,
    createPatch: addBehaviorComponent },
  { id: "joint", disabledReason: (object) => object.joint ? "This object already has a Joint." : !object.rigidbody?.enabled || object.rigidbody.bodyType !== "dynamic" ? "Add an enabled Dynamic Rigidbody first." : undefined,
    createPatch: () => ({ joint: defaultJoint() }) },
  {
    id: "animator",
    disabledReason: (object, context) => object.animator
      ? "This object already has an Animator Controller."
      : animatorComponentUnavailableReason(object, context?.animatorCatalog),
    createPatch: (object) => ({
      animator: createDefaultAnimatorComponent(
        object.id,
        `${object.name} Controller`,
      ),
    }),
  },
  {
    id: "characterController",
    disabledReason: characterControllerUnavailableReason,
    createPatch: createCharacterControllerPatch,
  },
  {
    id: "animationPlayer",
    disabledReason: (object) => object.primitive === "camera"
      ? "Cameras do not support Animation Player yet."
      : object.animationPlayer
        ? "This object already has an Animation Player."
        : undefined,
    createPatch: () => ({ animationPlayer: { enabled: true } }),
  },
  {
    id: "depthOfField",
    disabledReason: (object) => object.primitive !== "camera"
      ? "Only cameras can use Depth of Field."
      : object.depthOfField
        ? "This camera already has Depth of Field."
        : undefined,
    createPatch: () => ({ depthOfField: { ...defaultDepthOfFieldComponent } }),
  },
  {
    id: "motionPulse",
    disabledReason: (object) => object.primitive === "camera"
      ? "Cameras do not support Motion Pulse."
      : object.motionPulse
        ? "This object already has Motion Pulse."
        : undefined,
    createPatch: () => ({ motionPulse: createMotionPulseComponent() }),
  },
  {
    id: "rigidbody",
    disabledReason: (object) => object.primitive === "camera"
      ? "Cameras do not support Physics."
      : object.rigidbody
        ? "This object already has a Rigidbody."
        : undefined,
    createPatch: (object) => ({ rigidbody: defaultRigidbodyForObject(object) }),
  },
  {
    id: "collider",
    disabledReason: (object) => object.primitive === "camera" ? "Cameras do not support Physics." : undefined,
    createPatch: (object) => ({
      colliders: [...(object.colliders ?? []), defaultColliderForObject(object)],
    }),
  },
  {
    id: "waterSurface",
    disabledReason: (object) => object.primitive === "camera" || object.primitive === "cloner"
      ? "Cameras and generator objects do not support Water Surface."
      : object.water
        ? "This object already has Water Surface."
        : undefined,
    createPatch: () => ({ water: { ...defaultWaterSettings } }),
  },
];

const INTRINSIC_COMPONENT_OPERATIONS: SceneComponentOperation[] = [
  {
    id: "meshFilter",
    disabledReason: (object) => isMeshRenderObject(object) && isComponentRemoved(object, "meshFilter")
      ? undefined
      : "Mesh Filter is already present or unsupported.",
    createPatch: (object) => restoreComponentPatch(object, "meshFilter"),
  },
  {
    id: "meshRenderer",
    disabledReason: (object) => isMeshRenderObject(object) && isComponentRemoved(object, "meshRenderer")
      ? undefined
      : "Mesh Renderer is already present or unsupported.",
    createPatch: (object) => restoreComponentPatch(object, "meshRenderer"),
  },
  {
    id: "spriteRenderer",
    disabledReason: (object) => object.dimension === "2d" && isComponentRemoved(object, "spriteRenderer")
      ? undefined
      : "Sprite Renderer is already present or unsupported.",
    createPatch: (object) => restoreComponentPatch(object, "spriteRenderer"),
  },
  {
    id: "wireframe",
    disabledReason: (object) => isMeshRenderObject(object) && !object.wireframe
      ? undefined
      : "Wireframe is already present or unsupported.",
    createPatch: () => ({ wireframe: { enabled: true } }),
  },
];

const MODIFIER_COMPONENT_OPERATIONS: SceneComponentOperation[] = modifierRegistry.map((modifier) => ({
  id: `modifier:${modifier.type}`,
  disabledReason: (object) => {
    if (modifier.allowedPrimitives(object.primitive) && !object.water) return undefined;
    if (object.water || object.primitive === "water") return "Water surfaces provide the sampled surface.";
    if (object.primitive === "camera") return "Cameras do not support this modifier.";
    return "This modifier does not support this object type.";
  },
  createPatch: (object) => ({
    modifiers: [...(object.modifiers ?? []), createModifier(modifier.type, object)],
  }),
}));

export const sceneComponentOperations: readonly SceneComponentOperation[] = [
  ...INTRINSIC_COMPONENT_OPERATIONS,
  ...OPTIONAL_COMPONENT_OPERATIONS,
  ...MODIFIER_COMPONENT_OPERATIONS,
];
