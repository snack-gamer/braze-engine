import { InspectorNumberInput } from "../../components/InspectorNumberInput";
import { InspectorRow } from "../../components/InspectorRow";
import { InspectorToggle } from "../../components/InspectorToggle";
import type { SceneObject } from "../../scene/domain/scene-object";
import type { BehaviorValue } from "../domain/behavior-component";
import type { BehaviorField } from "../domain/behavior-registration";

export function BehaviorFieldControl({ field, value, label, objects, onChange }: Readonly<{
  field: BehaviorField;
  value: BehaviorValue;
  label: string;
  objects: readonly SceneObject[];
  onChange: (value: BehaviorValue) => void;
}>) {
  let control;
  if (field.kind === "number") {
    control = <InspectorNumberInput value={typeof value === "number" ? value : field.default}
      min={field.min} max={field.max} decimals={3} step={0.1} ariaLabel={label} onChange={onChange} />;
  } else if (field.kind === "boolean") {
    control = <InspectorToggle checked={typeof value === "boolean" ? value : field.default} ariaLabel={label} onChange={onChange} />;
  } else if (field.kind === "string") {
    control = <input type="text" aria-label={label} maxLength={field.maxLength}
      value={typeof value === "string" ? value : field.default} onChange={(event) => onChange(event.currentTarget.value)} />;
  } else {
    const entityId = value && typeof value === "object" ? value.entityId : "";
    control = <select aria-label={label} value={entityId} onChange={(event) => onChange(event.currentTarget.value ? { entityId: event.currentTarget.value } : null)}>
      <option value="">None</option>
      {entityId && !objects.some((object) => object.id === entityId) && <option value={entityId}>Missing object: {entityId}</option>}
      {objects.map((object) => <option key={object.id} value={object.id}>{object.name || "(unnamed)"}</option>)}
    </select>;
  }
  return <InspectorRow label={field.label}>{control}</InspectorRow>;
}
