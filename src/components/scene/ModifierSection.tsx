import type { LibraryAsset } from "../../lib/api";
import { AnimatorComponentEditor } from "../../character/components/AnimatorComponentEditor";
import { CharacterControllerEditor } from "../../character-controller/components/CharacterControllerEditor";
import { useCharacterPlaybackAssetCatalog } from "../../character/application/CharacterPlaybackAssetProvider";
import {
  modifierComponentCount,
  removeModifierById,
  replaceModifierById,
} from "../../modifiers/authoring/modifier-list";
import type {
  ModifierPinSelection,
  ObjectModifier,
  SceneObject,
} from "../../types";
import { animatorComponentUnavailableReason } from "../../scene/authoring/animator-component-eligibility";
import type { AnimatorImportedAssetCatalog } from "../../scene/authoring/animator-component-eligibility";
import { InspectorSection } from "./InspectorSection";
import { AnimationPlayerEditor } from "./modifiers/AnimationPlayerEditor";
import { BuoyancyEditor } from "./modifiers/BuoyancyEditor";
import { DisplacerEditor } from "./modifiers/DisplacerEditor";
import { MotionPulseEditor } from "./modifiers/MotionPulseEditor";

type ModifierSectionProps = {
  object: SceneObject;
  objects: SceneObject[];
  selectedModifierPin: ModifierPinSelection | null;
  selectModifierPin: (selection: ModifierPinSelection | null) => void;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
  imageAssets: LibraryAsset[];
  animatorCatalogOverride?: AnimatorImportedAssetCatalog;
  onOpenAnimatorController: () => void;
};

export const componentCountFor = (object: SceneObject): number => (
  modifierComponentCount(object) + (object.animator ? 1 : 0) + (object.characterController ? 1 : 0)
);

export function ModifierSection({
  object,
  objects,
  selectedModifierPin,
  selectModifierPin,
  updateObject,
  imageAssets,
  animatorCatalogOverride,
  onOpenAnimatorController,
}: ModifierSectionProps) {
  const publishedAnimatorCatalog = useCharacterPlaybackAssetCatalog();
  const animatorCatalog = animatorCatalogOverride ?? publishedAnimatorCatalog;
  const modifiers = object.modifiers ?? [];
  const componentCount = componentCountFor(object);
  if (componentCount === 0) return null;

  const patchModifier = (next: ObjectModifier) => {
    updateObject(object.id, { modifiers: replaceModifierById(modifiers, next) });
  };
  const removeModifier = (modifierId: string) => {
    if (selectedModifierPin?.objectId === object.id && selectedModifierPin.modifierId === modifierId) {
      selectModifierPin(null);
    }
    updateObject(object.id, { modifiers: removeModifierById(modifiers, modifierId) });
  };
  const waterObjects = objects.filter((item) => item.water);

  return (
    <InspectorSection id="object.components" title="Components" meta={componentCount} defaultOpen>
      <div className="modifier-editor-list">
        {object.animator && (
          <AnimatorComponentEditor
            component={object.animator}
            modelGuid={object.assetRef?.guid}
            readOnlyReason={animatorComponentUnavailableReason(object, animatorCatalog)}
            update={(animator) => updateObject(object.id, { animator })}
            remove={() => updateObject(object.id, { animator: undefined })}
            onOpenController={onOpenAnimatorController}
          />
        )}
        {object.characterController && (
          <CharacterControllerEditor object={object} updateObject={updateObject} />
        )}
        {object.animationPlayer && (
          <AnimationPlayerEditor
            enabled={object.animationPlayer.enabled !== false}
            update={(enabled) => updateObject(object.id, { animationPlayer: { enabled } })}
            remove={() => updateObject(object.id, { animationPlayer: undefined })}
          />
        )}
        {object.motionPulse && (
          <MotionPulseEditor
            owner={object}
            objects={objects}
            component={object.motionPulse}
            updateObject={updateObject}
          />
        )}
        {modifiers.map((modifier) => {
          if (modifier.type === "buoyancy") {
            return (
              <BuoyancyEditor
                key={modifier.id}
                modifier={modifier}
                objectId={object.id}
                selectedModifierPin={selectedModifierPin}
                selectModifierPin={selectModifierPin}
                waterObjects={waterObjects}
                patchModifier={patchModifier}
                removeModifier={removeModifier}
              />
            );
          }
          if (modifier.type === "displacer") {
            return (
              <DisplacerEditor
                key={modifier.id}
                modifier={modifier}
                imageAssets={imageAssets}
                patchModifier={patchModifier}
                removeModifier={removeModifier}
              />
            );
          }
          return null;
        })}
      </div>
    </InspectorSection>
  );
}
