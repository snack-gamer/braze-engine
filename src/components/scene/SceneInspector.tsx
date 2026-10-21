import { type Material, type SceneObject } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { primitiveIconNames } from "../../ui/icons";
import { objectKindTone } from "../../scene/presentation/object-kind-presentation";
import { AddComponentButton } from "./AddComponentButton";
import { PanelHeader } from "./PanelHeader";
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
      <PanelHeader
        title={activeObject.name || "(unnamed)"}
        tone={objectKindTone(activeObject.primitive)}
        icon={<EditorIcon name={primitiveIconNames[activeObject.primitive]} size="control" />}
        actions={(
          <>
            <button
              className={`icon-button ${activeObject.visible ? "" : "active"}`}
              onClick={() => updateObject(activeObject.id, { visible: !activeObject.visible })}
              type="button"
              title={activeObject.visible ? "Hide" : "Show"}
            >
              <EditorIcon name={activeObject.visible ? "visible" : "hidden"} size="control" />
            </button>
            <button
              className={`icon-button ${activeObject.locked ? "active" : ""}`}
              onClick={() => updateObject(activeObject.id, { locked: !activeObject.locked })}
              type="button"
              title={activeObject.locked ? "Unlock" : "Lock"}
            >
              <EditorIcon name={activeObject.locked ? "locked" : "unlocked"} size="control" />
            </button>
          </>
        )}
      />

      <EntityTagHeader object={activeObject} objects={objects}
        onChange={(tags) => updateObject(activeObject.id, { tags })} />
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
