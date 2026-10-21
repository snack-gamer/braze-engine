import { JointEditor } from "../../physics/components/JointEditor";
import { BehaviorInspector } from "../../behaviors/components/BehaviorInspector";
import { UiCanvasInspector } from "../../game-ui/components/UiCanvasInspector";
import { Fragment, lazy, Suspense, useMemo, type ReactNode } from "react";
import { compileAuthoredPhysicsScene } from "../../physics/authoring/scene-compiler";
import { isColliderBeingEdited, type ColliderEditSelection } from "../../physics/authoring/collider-edit";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../../physics/domain/world-settings";
import {
  inspectorSectionsForObject,
  type SceneInspectorSectionId,
} from "../../scene/presentation/scene-component-registry";
import type { LibraryAsset } from "../../lib/api";
import type { Material, ModifierPinSelection, SceneObject } from "../../types";
import { ColliderSection, RigidbodySection } from "../physics/PhysicsSections";
import { PhysicsValidation } from "../physics/PhysicsValidation";
import { DirectionalLightSection } from "./DirectionalLightSection";
import { MaterialSection } from "./MaterialSection";
import { ModifierSection } from "./ModifierSection";
import { SpriteRendererSection } from "./SpriteRendererSection";
import { TransformSection, type AnimatedTransformChannels } from "./TransformSection";
import { WireframeSection } from "./WireframeSection";

const LazyClonerSection = lazy(async () => {
  const module = await import("./ClonerSection");
  return { default: module.ClonerSection };
});
const LazyEffectorSection = lazy(async () => {
  const module = await import("./EffectorSection");
  return { default: module.EffectorSection };
});
const LazyParticleSection = lazy(async () => {
  const module = await import("./ParticleSection");
  return { default: module.ParticleSection };
});
const LazyWaterComponentEditor = lazy(async () => {
  const module = await import("./WaterSection");
  return { default: module.WaterComponentEditor };
});

function InspectorSectionLoading({ label }: { label: string }) {
  return <div className="component-card" role="status">Loading {label}…</div>;
}

export type SceneObjectInspectorContext = {
  activeObject: SceneObject;
  objects: SceneObject[];
  animatedTransformChannels?: AnimatedTransformChannels;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
  materialLibrary: Material[];
  imageAssets: LibraryAsset[];
  editingCollider: ColliderEditSelection | null;
  onEditCollider: (selection: ColliderEditSelection | null) => void;
  selectedModifierPin: ModifierPinSelection | null;
  selectModifierPin: (selection: ModifierPinSelection | null) => void;
  onOpenAnimatorController: () => void;
};

type SectionRenderContext = SceneObjectInspectorContext & {
  physicsDiagnostics: ReturnType<typeof compileAuthoredPhysicsScene>["diagnostics"];
};

type InspectorSectionRenderer = (context: SectionRenderContext) => ReactNode;

const sectionRenderers: Record<SceneInspectorSectionId, InspectorSectionRenderer> = {
  transform: ({ activeObject, animatedTransformChannels, updateObject }) => (
    <TransformSection
      object={activeObject}
      animatedChannels={animatedTransformChannels}
      updateObject={updateObject}
    />
  ),
  cloner: ({ activeObject, objects, updateObject }) => (
    <Suspense fallback={<InspectorSectionLoading label="Cloner" />}>
      <LazyClonerSection object={activeObject} objects={objects} updateObject={updateObject} />
    </Suspense>
  ),
  effector: ({ activeObject, objects, updateObject }) => (
    <Suspense fallback={<InspectorSectionLoading label="Effector" />}>
      <LazyEffectorSection object={activeObject} objects={objects} updateObject={updateObject} />
    </Suspense>
  ),
  particle: ({ activeObject, updateObject }) => (
    <Suspense fallback={<InspectorSectionLoading label="Particle" />}>
      <LazyParticleSection object={activeObject} updateObject={updateObject} />
    </Suspense>
  ),
  directionalLight: ({ activeObject, updateObject }) => (
    <DirectionalLightSection object={activeObject} updateObject={updateObject} />
  ),
  meshRenderer: ({ activeObject, materialLibrary, updateObject }) => (
    <MaterialSection object={activeObject} materialLibrary={materialLibrary} updateObject={updateObject} />
  ),
  spriteRenderer: ({ activeObject, updateObject }) => (
    <SpriteRendererSection object={activeObject} updateObject={updateObject} />
  ),
  waterSurface: ({ activeObject, updateObject }) => (
    <Suspense fallback={<InspectorSectionLoading label="Water Surface" />}>
      <LazyWaterComponentEditor object={activeObject} updateObject={updateObject} />
    </Suspense>
  ),
  physicsValidation: ({ physicsDiagnostics }) => <PhysicsValidation diagnostics={physicsDiagnostics} />,
  rigidbody: ({ activeObject, updateObject }) => (
    <RigidbodySection object={activeObject} updateObject={updateObject} />
  ),
  joint: ({ activeObject, objects, updateObject }) => <JointEditor object={activeObject} objects={objects} updateObject={updateObject} />,
  behaviors: ({ activeObject, objects, updateObject }) => <BehaviorInspector object={activeObject} objects={objects} updateObject={updateObject} />,
  uiCanvas: ({ activeObject, updateObject }) => <UiCanvasInspector object={activeObject} updateObject={updateObject} />,
  colliders: ({ activeObject, editingCollider, onEditCollider, updateObject }) => (
    <>
      {activeObject.colliders?.map((collider) => (
        <ColliderSection
          key={collider.id}
          object={activeObject}
          collider={collider}
          updateObject={updateObject}
          editing={isColliderBeingEdited(editingCollider, activeObject.id, collider.id)}
          onEdit={(active) => onEditCollider(active ? { objectId: activeObject.id, colliderId: collider.id } : null)}
        />
      ))}
    </>
  ),
  components: ({ activeObject, objects, imageAssets, selectedModifierPin, selectModifierPin, updateObject, onOpenAnimatorController }) => (
    <ModifierSection
      object={activeObject}
      objects={objects}
      imageAssets={imageAssets}
      selectedModifierPin={selectedModifierPin}
      selectModifierPin={selectModifierPin}
      updateObject={updateObject}
      onOpenAnimatorController={onOpenAnimatorController}
    />
  ),
  wireframe: ({ activeObject, updateObject }) => (
    <WireframeSection object={activeObject} updateObject={updateObject} />
  ),
};

export function SceneObjectInspectorSections(props: SceneObjectInspectorContext) {
  const physicsDiagnostics = useMemo(
    () => compileAuthoredPhysicsScene(
      props.objects,
      "inspector-validation",
      DEFAULT_PHYSICS_WORLD_SETTINGS,
    ).diagnostics.filter((diagnostic) => diagnostic.objectId === props.activeObject.id),
    [props.activeObject.id, props.objects],
  );
  const context = { ...props, physicsDiagnostics };

  return inspectorSectionsForObject(props.activeObject).map((descriptor) => (
    <Fragment key={descriptor.id}>{sectionRenderers[descriptor.id](context)}</Fragment>
  ));
}
