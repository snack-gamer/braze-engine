import { type Material, type SceneObject } from "../../types";
import { AddComponentButton } from "./AddComponentButton";
import { SceneObjectHeader } from "./SceneObjectHeader";
import { PrefabInstanceCard } from "./PrefabInstanceCard";
import type { ColliderEditSelection } from "../../physics/authoring/collider-edit";
import type { LibraryAsset } from "../../lib/api";
import type { ModifierPinSelection } from "../../types";
import {
  SceneObjectInspectorSections,
} from "./SceneObjectInspectorSections";
import type { AnimatedTransformChannels } from "./TransformSection";
import { EntityTagHeader } from "../../world/components/EntityTagHeader";

export type { AnimatedTransformChannels } from "./TransformSection";

type SceneInspectorProps = {
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

export function SceneInspector(props: SceneInspectorProps) {
  const {
    activeObject,
    objects,
    animatedTransformChannels,
    updateObject,
    materialLibrary,
    imageAssets,
    editingCollider,
    onEditCollider,
    selectedModifierPin,
    selectModifierPin,
    onOpenAnimatorController,
  } = props;

  return (
    <form className="rail-scroll" autoComplete="off" data-form-type="other" onSubmit={(event) => event.preventDefault()}>
      <SceneObjectHeader object={activeObject} updateObject={updateObject} />
      <EntityTagHeader object={activeObject} objects={objects}
        onLayerChange={(layer) => updateObject(activeObject.id, { layer })} onChange={(tags) => updateObject(activeObject.id, { tags })} />
      <PrefabInstanceCard object={activeObject} />
      <SceneObjectInspectorSections
        activeObject={activeObject}
        objects={objects}
        animatedTransformChannels={animatedTransformChannels}
        updateObject={updateObject}
        materialLibrary={materialLibrary}
        imageAssets={imageAssets}
        editingCollider={editingCollider}
        onEditCollider={onEditCollider}
        selectedModifierPin={selectedModifierPin}
        selectModifierPin={selectModifierPin}
        onOpenAnimatorController={onOpenAnimatorController}
      />

      <AddComponentButton object={activeObject} updateObject={updateObject} />
    </form>
  );
}
