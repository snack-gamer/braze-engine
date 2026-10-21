import { useState } from "react";
import type { SceneObject } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { useCharacterPlaybackAssetCatalog } from "../../character/application/CharacterPlaybackAssetProvider";
import {
  listSceneComponentAdditions,
  type ResolvedSceneComponentAddition,
} from "../../scene/presentation/scene-component-registry";
import { AddComponentMenu } from "./AddComponentMenu";

type AddComponentButtonProps = {
  object: SceneObject;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
};

export function AddComponentButton({ object, updateObject }: AddComponentButtonProps) {
  const animatorCatalog = useCharacterPlaybackAssetCatalog();
  const [open, setOpen] = useState(false);

  const additions = listSceneComponentAdditions(object, "inspector", false, { animatorCatalog });

  const addComponent = (component: ResolvedSceneComponentAddition) => {
    updateObject(object.id, component.createPatch(object));
    setOpen(false);
  };

  return (
    <div className="add-component">
      <button
        type="button"
        className="ghost-button add-component__button"
        onClick={() => setOpen((value) => !value)}
        disabled={additions.length === 0}
        title="Add a component"
      >
        <EditorIcon name="add" size="control" /> Add Component
      </button>
      {open && additions.length > 0 && (
        <AddComponentMenu additions={additions} onAdd={addComponent} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
