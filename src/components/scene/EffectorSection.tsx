import {
  defaultEffectorSettings,
  effectorTypeDefaults,
  normalizeEffectorSettings,
} from "../../lib/effector";
import {
  effectorClonerUsageCount,
  effectorTargetCandidates,
  patchEffectorVector,
  type EffectorVectorKey,
} from "../../scene/authoring/effector-editor-operations";
import type { EffectorSettings, EffectorType, SceneObject } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { EffectorBehaviorFieldControls } from "./effector/EffectorBehaviorFieldControls";
import { EffectorTransformControls } from "./effector/EffectorTransformControls";
import { PushApartEffectorControls } from "./effector/PushApartEffectorControls";
import { RandomEffectorControls } from "./effector/RandomEffectorControls";
import { ShaderEffectorControls } from "./effector/ShaderEffectorControls";
import { StepEffectorControls } from "./effector/StepEffectorControls";
import { TargetEffectorControls } from "./effector/TargetEffectorControls";
import { InspectorSection } from "./InspectorSection";

type EffectorSectionProps = {
  object: SceneObject;
  objects: SceneObject[];
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
};

export function EffectorSection({ object, objects, updateObject }: EffectorSectionProps) {
  const effector = normalizeEffectorSettings(object.effector);
  const usedByCloners = effectorClonerUsageCount(objects, object.id);
  const targetCandidates = effectorTargetCandidates(objects, object.id);
  const patch = (partial: Partial<EffectorSettings>) => {
    updateObject(object.id, {
      effector: normalizeEffectorSettings({ ...effector, ...partial }),
    });
  };
  const patchVector = (key: EffectorVectorKey, axis: number, value: number) => {
    patch(patchEffectorVector(effector, key, axis, value));
  };
  const setType = (type: EffectorType) => patch({ type, ...effectorTypeDefaults(type) });

  return (
    <InspectorSection
      id="object.effector"
      title="Effector"
      icon={<EditorIcon name="objectEffector" size="control" />}
      meta={usedByCloners > 0 ? `${usedByCloners} cloner${usedByCloners === 1 ? "" : "s"}` : "unassigned"}
      defaultOpen
      enable={{
        checked: effector.enabled,
        onChange: (enabled) => patch({ enabled }),
        ariaLabel: "Enable Effector",
      }}
      onReset={() => updateObject(object.id, {
        effector: normalizeEffectorSettings({
          ...defaultEffectorSettings,
          type: effector.type,
          ...effectorTypeDefaults(effector.type),
        }),
      })}
    >
      <EffectorBehaviorFieldControls effector={effector} patch={patch} patchVector={patchVector} setType={setType} />
      <EffectorTransformControls effector={effector} patch={patch} patchVector={patchVector} />
      <RandomEffectorControls effector={effector} patch={patch} />
      <StepEffectorControls effector={effector} patch={patch} />
      <TargetEffectorControls effector={effector} targetCandidates={targetCandidates} patch={patch} patchVector={patchVector} />
      <ShaderEffectorControls effector={effector} patch={patch} patchVector={patchVector} />
      <PushApartEffectorControls effector={effector} patch={patch} />
      {usedByCloners === 0 && (
        <p className="empty-note cloner-state-note">Add this effector to a Cloner's effector list to see its influence.</p>
      )}
    </InspectorSection>
  );
}
