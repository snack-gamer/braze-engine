import { useState } from "react";
import {
  defaultClonerSettings,
  normalizeClonerSettings,
} from "../../lib/cloner";
import {
  clonerCloneCount,
  clonerInputCandidates,
  clonerSourceCount,
  patchClonerVector,
  uniformClonerVector,
  type ClonerVectorKey,
} from "../../scene/authoring/cloner-editor-operations";
import type { ClonerSettings, SceneObject } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { ClonerEffectorStack } from "./cloner/ClonerEffectorStack";
import { ClonerObjectPanel } from "./cloner/ClonerObjectPanel";
import { ClonerTransformPanel } from "./cloner/ClonerTransformPanel";
import { InspectorSection } from "./InspectorSection";

type ClonerSectionProps = {
  object: SceneObject;
  objects: SceneObject[];
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
};

export function ClonerSection({ object, objects, updateObject }: ClonerSectionProps) {
  const cloner = normalizeClonerSettings(object.cloner);
  const [activePanel, setActivePanel] = useState<"object" | "transform">("object");
  const sourceCount = clonerSourceCount(objects, object.id);
  const inputCandidates = clonerInputCandidates(objects, object.id);
  const inputObject = cloner.inputObjectId
    ? inputCandidates.find((item) => item.id === cloner.inputObjectId) ?? null
    : null;
  const patchCloner = (patch: Partial<ClonerSettings>) => {
    updateObject(object.id, { cloner: normalizeClonerSettings({ ...cloner, ...patch }) });
  };
  const patchVector = (
    key: ClonerVectorKey,
    axis: number,
    value: number,
    integer = false,
  ) => patchCloner(patchClonerVector(cloner, key, axis, value, integer));
  const patchUniform = (
    key: "jitterPosition" | "jitterRotation" | "jitterScale",
    value: number,
  ) => patchCloner(uniformClonerVector(key, value));

  return (
    <InspectorSection
      id="object.cloner"
      title="Cloner"
      icon={<EditorIcon name="objectCloner" size="control" />}
      meta={`${sourceCount} source${sourceCount === 1 ? "" : "s"}`}
      className="cloner-section"
      defaultOpen
      enable={{
        checked: cloner.enabled,
        onChange: (enabled) => patchCloner({ enabled }),
        ariaLabel: "Enable Cloner",
      }}
      onReset={() => updateObject(object.id, {
        cloner: normalizeClonerSettings(defaultClonerSettings),
      })}
    >
      <div className="cloner-c4d">
        <div className="cloner-tabs" role="tablist" aria-label="Cloner settings">
          {[["object", "Object"], ["transform", "Transform"]].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activePanel === id}
              className={activePanel === id ? "active" : ""}
              onClick={() => setActivePanel(id as "object" | "transform")}
            >
              {label}
            </button>
          ))}
        </div>
        {activePanel === "object" && (
          <ClonerObjectPanel
            cloner={cloner}
            cloneCount={clonerCloneCount(cloner)}
            sourceCount={sourceCount}
            inputCandidates={inputCandidates}
            inputObject={inputObject}
            patchCloner={patchCloner}
            patchVector={patchVector}
            patchUniform={patchUniform}
          />
        )}
        {activePanel === "transform" && (
          <ClonerTransformPanel cloner={cloner} patchCloner={patchCloner} patchVector={patchVector} />
        )}
        <ClonerEffectorStack cloner={cloner} objects={objects} patchCloner={patchCloner} />
      </div>
    </InspectorSection>
  );
}
