import { RIGIDBODY_TYPE_OPTIONS, normalizeRigidbody } from "../../physics/authoring/component-defaults";
import type {
  RigidbodyBodyType,
  RigidbodyComponent,
  RigidbodyMassMode,
  SceneObject,
} from "../../types";
import { InspectorNumberInput } from "../InspectorNumberInput";
import { InspectorRow } from "../InspectorRow";
import { InspectorSegmented } from "../InspectorSegmented";
import { InspectorSlider } from "../InspectorSlider";
import { InspectorToggle } from "../InspectorToggle";
import { SceneComponentSection } from "../scene/SceneComponentPresentation";
import { RemovePhysicsComponentButton, type UpdateObject } from "./physics-section-controls";

const MASS_MODE_OPTIONS: Array<{ id: RigidbodyMassMode; label: string }> = [
  { id: "automatic", label: "Automatic" },
  { id: "manual", label: "Manual" },
];

export function RigidbodySection({ object, updateObject }: { object: SceneObject; updateObject: UpdateObject }) {
  const rigidbody = normalizeRigidbody(object.rigidbody);
  const patch = (value: Partial<RigidbodyComponent>) =>
    updateObject(object.id, { rigidbody: normalizeRigidbody({ ...rigidbody, ...value }) });
  const dynamic = rigidbody.bodyType === "dynamic";

  return (
    <SceneComponentSection
      componentId="rigidbody"
      id="object.rigidbody"
      meta={rigidbody.enabled ? rigidbody.bodyType : "off"}
      defaultOpen
      actions={<RemovePhysicsComponentButton title="Remove Rigidbody" onClick={() => updateObject(object.id, { rigidbody: undefined })} />}
    >
      <InspectorRow label="Enabled">
        <InspectorToggle checked={rigidbody.enabled} ariaLabel="Enable Rigidbody" onChange={(enabled) => patch({ enabled })} />
      </InspectorRow>
      <InspectorRow label="Body Type">
        <InspectorSegmented
          options={RIGIDBODY_TYPE_OPTIONS}
          value={rigidbody.bodyType}
          ariaLabel="Rigidbody body type"
          onChange={(bodyType: RigidbodyBodyType) => patch({ bodyType })}
        />
      </InspectorRow>
      <InspectorRow label="Mass Mode">
        <InspectorSegmented options={MASS_MODE_OPTIONS} value={rigidbody.massMode} ariaLabel="Rigidbody mass mode" onChange={(massMode) => patch({ massMode })} disabled={!dynamic} />
      </InspectorRow>
      {rigidbody.massMode === "manual" ? (
        <InspectorRow label="Mass">
          <InspectorNumberInput value={rigidbody.mass} min={0.0001} step={0.01} decimals={3} ariaLabel="Rigidbody mass" onChange={(mass) => patch({ mass })} disabled={!dynamic} />
        </InspectorRow>
      ) : (
        <InspectorRow label="Density">
          <InspectorNumberInput value={rigidbody.density} min={0.0001} step={0.01} decimals={3} ariaLabel="Rigidbody density" onChange={(density) => patch({ density })} disabled={!dynamic} />
        </InspectorRow>
      )}
      <InspectorRow label="Use Gravity">
        <InspectorToggle checked={rigidbody.useGravity} ariaLabel="Rigidbody use gravity" onChange={(useGravity) => patch({ useGravity })} disabled={!dynamic} />
      </InspectorRow>
      <InspectorRow label="Linear Damping">
        <InspectorSlider value={rigidbody.linearDamping} min={0} max={1000} step={0.01} rangeMax={10} decimals={2} ariaLabel="Rigidbody linear damping" onChange={(linearDamping) => patch({ linearDamping })} disabled={!dynamic} />
      </InspectorRow>
      <InspectorRow label="Angular Damping">
        <InspectorSlider value={rigidbody.angularDamping} min={0} max={1000} step={0.01} rangeMax={10} decimals={2} ariaLabel="Rigidbody angular damping" onChange={(angularDamping) => patch({ angularDamping })} disabled={!dynamic} />
      </InspectorRow>
      <InspectorRow label="Interpolation">
        <select value={rigidbody.interpolation} aria-label="Rigidbody interpolation" onChange={(event) => patch({ interpolation: event.target.value as RigidbodyComponent["interpolation"] })} disabled={!dynamic}>
          <option value="none">None</option>
          <option value="interpolate">Interpolate</option>
        </select>
      </InspectorRow>
    </SceneComponentSection>
  );
}
