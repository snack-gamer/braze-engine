import { isComponentRemoved, isMeshRenderObject } from "../../lib/components";
import { modifierDescriptor } from "../../modifiers/registry";
import {
  sceneComponentOperations,
  type SceneComponentAdditionId,
  type SceneComponentOperation,
} from "../authoring/component-registry";
import type { SceneObject } from "../../types";
import type { EditorIconName } from "../../ui/icons";
import type { EditorTone } from "../../ui/tones";
import type { AnimatorImportedAssetCatalog } from "../authoring/animator-component-eligibility";

export type SceneComponentMenuSurface = "hierarchy" | "inspector";
export type SceneComponentFamily = "component" | "modifier";
/** Presentation identity is shared by creation menus and the Inspector. */
export type SceneComponentPresentationId = SceneComponentAdditionId;
export type SceneComponentCategory =
  | "Animation"
  | "Effects"
  | "Gameplay"
  | "UI"
  | "Mesh"
  | "Modifiers"
  | "Physics"
  | "Rendering";

export type SceneComponentPresentation = {
  family: SceneComponentFamily;
  category: SceneComponentCategory;
  label: string;
  description: string;
  hierarchyIcon: EditorIconName;
  componentIcon: EditorIconName;
  surfaces: readonly SceneComponentMenuSurface[];
};

const buoyancyModifier = modifierDescriptor("buoyancy");
const displacerModifier = modifierDescriptor("displacer");

const presentationById = {
  uiCanvas: {
    family: "component", category: "UI", label: "UI Canvas",
    description: "Responsive layouts, text, buttons, inputs and progress. Script actions and tweens through the public UI API.",
    hierarchyIcon: "uiCanvas", componentIcon: "uiCanvas", surfaces: ["hierarchy", "inspector"],
  },
  behaviors: {
    family: "component", category: "Gameplay", label: "Behaviors",
    description: "Attach reusable gameplay scripts with saved settings and object lifecycle callbacks.",
    hierarchyIcon: "behaviors", componentIcon: "behaviors", surfaces: ["hierarchy", "inspector"],
  },
  meshFilter: {
    family: "component", category: "Mesh", label: "Mesh Filter",
    description: "Restore this object's intrinsic mesh source.",
    hierarchyIcon: "meshFilter", componentIcon: "meshFilter", surfaces: ["inspector"],
  },
  meshRenderer: {
    family: "component", category: "Mesh", label: "Mesh Renderer",
    description: "Restore this object's intrinsic mesh renderer.",
    hierarchyIcon: "meshRenderer", componentIcon: "meshRenderer", surfaces: ["inspector"],
  },
  spriteRenderer: {
    family: "component", category: "Rendering", label: "Sprite Renderer",
    description: "Restore this object's intrinsic sprite renderer.",
    hierarchyIcon: "spriteRenderer", componentIcon: "spriteRenderer", surfaces: ["inspector"],
  },
  wireframe: {
    family: "component", category: "Rendering", label: "Wireframe",
    description: "Render this mesh as wireframe in the viewport.",
    hierarchyIcon: "wireframe", componentIcon: "wireframe", surfaces: ["inspector"],
  },
  animationPlayer: {
    family: "component", category: "Animation", label: "Animation Player",
    description: "Make this object and its children editable in the animation timeline.",
    hierarchyIcon: "animationPlayer", componentIcon: "animationPlayer", surfaces: ["hierarchy", "inspector"],
  },
  animator: {
    family: "component", category: "Animation", label: "Animator Controller",
    description: "Author this character's gameplay state machine.",
    hierarchyIcon: "animatorController", componentIcon: "animatorController", surfaces: ["hierarchy", "inspector"],
  },
  characterController: {
    family: "component", category: "Physics", label: "Character Controller",
    description: "Own kinematic collision and movement for this playable character root.",
    hierarchyIcon: "characterController", componentIcon: "characterController", surfaces: ["hierarchy", "inspector"],
  },
  depthOfField: {
    family: "component", category: "Rendering", label: "Depth of Field",
    description: "Add aperture blur controls to this camera.",
    hierarchyIcon: "depthOfField", componentIcon: "depthOfField", surfaces: ["hierarchy", "inspector"],
  },
  motionPulse: {
    family: "component", category: "Effects", label: "Motion Pulse",
    description: "Drive local transform loops on this object or its children.",
    hierarchyIcon: "motionPulse", componentIcon: "motionPulse", surfaces: ["hierarchy", "inspector"],
  },
  rigidbody: {
    family: "component", category: "Physics", label: "Rigidbody",
    description: "Make this object dynamic or kinematic in the physics world.",
    hierarchyIcon: "physics", componentIcon: "physics", surfaces: ["hierarchy", "inspector"],
  },
  joint: { family: "component", category: "Physics", label: "Joint", description: "Connect bodies with distance, ball, fixed or hinge constraints.",
    hierarchyIcon: "joint", componentIcon: "joint", surfaces: ["hierarchy", "inspector"] },
  collider: {
    family: "component", category: "Physics", label: "Collider",
    description: "Add a collision shape; multiple Colliders form one authored body.",
    hierarchyIcon: "collider", componentIcon: "collider", surfaces: ["hierarchy", "inspector"],
  },
  waterSurface: {
    family: "component", category: "Rendering", label: "Water Surface",
    description: "Render this object's surface as animated water.",
    hierarchyIcon: "objectWater", componentIcon: "objectWater", surfaces: ["hierarchy", "inspector"],
  },
  "modifier:buoyancy": {
    family: "modifier", category: "Modifiers", label: buoyancyModifier.label, description: buoyancyModifier.description,
    hierarchyIcon: "modifier", componentIcon: "modifierTool", surfaces: ["hierarchy", "inspector"],
  },
  "modifier:displacer": {
    family: "modifier", category: "Modifiers", label: displacerModifier.label, description: displacerModifier.description,
    hierarchyIcon: "modifierDisplacer", componentIcon: "modifierTool", surfaces: ["hierarchy", "inspector"],
  },
} satisfies Record<SceneComponentPresentationId, SceneComponentPresentation>;

export function sceneComponentPresentation(
  id: SceneComponentPresentationId,
): SceneComponentPresentation {
  return presentationById[id];
}

const toneByCategory = {
  Animation: "animation",
  Effects: "effects",
  Gameplay: "neutral",
  UI: "neutral",
  Mesh: "mesh",
  Modifiers: "modifiers",
  Physics: "physics",
  Rendering: "rendering",
} as const satisfies Record<SceneComponentCategory, EditorTone>;

/** Every surface that shows a component colors it by its category tone. */
export function sceneComponentTone(id: SceneComponentPresentationId): EditorTone {
  return toneByCategory[presentationById[id].category];
}

const PRESENTATION_ORDER = [
  "animator", "animationPlayer",
  "motionPulse",
  "behaviors", "uiCanvas",
  "meshFilter", "meshRenderer",
  "modifier:buoyancy", "modifier:displacer",
  "characterController", "rigidbody", "collider", "joint",
  "spriteRenderer", "wireframe", "depthOfField", "waterSurface",
] as const satisfies readonly SceneComponentAdditionId[];

export type SceneComponentAddition = SceneComponentOperation & SceneComponentPresentation;

export type ResolvedSceneComponentAddition = SceneComponentAddition & {
  enabled: boolean;
  unavailableReason?: string;
};

const operationById = new Map(sceneComponentOperations.map((operation) => [operation.id, operation]));

export const sceneComponentAdditions: readonly SceneComponentAddition[] = PRESENTATION_ORDER.map((id) => {
  const operation = operationById.get(id);
  if (!operation) throw new Error(`Missing authored component operation for "${id}".`);
  const presentation = presentationById[id];
  return { ...operation, ...presentation };
});

export function listSceneComponentAdditions(
  object: SceneObject,
  surface: SceneComponentMenuSurface,
  includeUnavailable = false,
  context?: Readonly<{ animatorCatalog?: AnimatorImportedAssetCatalog }>,
): ResolvedSceneComponentAddition[] {
  return sceneComponentAdditions.flatMap((addition) => {
    if (!addition.surfaces.includes(surface)) return [];
    const unavailableReason = addition.disabledReason(object, context);
    if (unavailableReason && !includeUnavailable) return [];
    return [{ ...addition, enabled: !unavailableReason, unavailableReason }];
  });
}

export type SceneInspectorSectionId =
  | "transform"
  | "cloner"
  | "effector"
  | "particle"
  | "directionalLight"
  | "meshRenderer"
  | "spriteRenderer"
  | "waterSurface"
  | "physicsValidation"
  | "rigidbody"
  | "joint"
  | "colliders"
  | "components"
  | "behaviors"
  | "uiCanvas"
  | "wireframe";

export type SceneInspectorSectionDescriptor = {
  id: SceneInspectorSectionId;
  order: number;
  isVisible: (object: SceneObject) => boolean;
};

export const sceneInspectorSectionDescriptors: readonly SceneInspectorSectionDescriptor[] = [
  { id: "transform", order: 0, isVisible: () => true },
  { id: "cloner", order: 100, isVisible: (object) => object.primitive === "cloner" },
  { id: "effector", order: 110, isVisible: (object) => object.primitive === "effector" },
  { id: "particle", order: 120, isVisible: (object) => object.primitive === "particle" },
  { id: "directionalLight", order: 130, isVisible: (object) => object.primitive === "directionalLight" },
  { id: "meshRenderer", order: 200, isVisible: (object) => object.dimension !== "2d" && isMeshRenderObject(object) },
  { id: "spriteRenderer", order: 210, isVisible: (object) => object.dimension === "2d" && !isComponentRemoved(object, "spriteRenderer") },
  { id: "waterSurface", order: 300, isVisible: (object) => Boolean(object.water) },
  { id: "physicsValidation", order: 390, isVisible: () => true },
  { id: "rigidbody", order: 400, isVisible: (object) => Boolean(object.rigidbody) },
  { id: "colliders", order: 410, isVisible: (object) => Boolean(object.colliders?.length) },
  { id: "joint", order: 420, isVisible: (object) => Boolean(object.joint) },
  { id: "components", order: 500, isVisible: (object) => Boolean(object.animator || object.characterController || object.animationPlayer || object.motionPulse || object.modifiers?.length) },
  { id: "behaviors", order: 510, isVisible: (object) => Boolean(object.behaviors) },
  { id: "uiCanvas", order: 520, isVisible: (object) => Boolean(object.uiCanvas) },
  { id: "wireframe", order: 600, isVisible: (object) => Boolean(object.wireframe) },
];

export function inspectorSectionsForObject(object: SceneObject): SceneInspectorSectionDescriptor[] {
  return sceneInspectorSectionDescriptors.filter((descriptor) => descriptor.isVisible(object));
}
