import { InspectorNumberInput } from "../../../components/InspectorNumberInput";
import { EditorCheckbox } from "../../../ui/controls";
import { EditorIcon } from "../../../ui/EditorIcon";
import {
  patchAnimatorParameter,
  removeAnimatorParameter,
} from "../../application/animator-controller-authoring";
import type { AnimatorController } from "../../domain/animator-controller";
import { visitAnimatorMotions } from "../../domain/animator-state-machine";
import { CommittedTextInput } from "../CommittedTextInput";
import {
  inspectorContentClass,
  inspectorDangerButtonClass,
  inspectorSectionClass,
  inspectorTitleClass,
} from "./animator-inspector-classes";
import type { AnimatorPreview } from "./useAnimatorPreview";

type AnimatorParameterInspectorProps = Readonly<{
  controller: AnimatorController;
  parameterId: string;
  preview: AnimatorPreview;
  onChange: (controller: AnimatorController) => void;
  onDeleted: () => void;
}>;

export function AnimatorParameterInspector({ controller, parameterId, preview, onChange, onDeleted }: AnimatorParameterInspectorProps) {
  const parameter = controller.parameters.find((candidate) => candidate.id === parameterId);
  if (!parameter) return null;
  const previewValue = preview.values[parameter.id];
  const range = parameter.kind === "float" ? blendParameterRange(controller, parameter.id) : undefined;
  return (
    <div className={inspectorContentClass}>
      <header className={inspectorTitleClass}>
        <div><small>{parameterKindLabel(parameter.kind)} parameter</small><CommittedTextInput autoFocus value={parameter.name} ariaLabel="Parameter name" onCommit={(name) => onChange(patchAnimatorParameter(controller, parameter.id, { name }))} /></div>
        <button type="button" className={inspectorDangerButtonClass} title="Delete parameter" onClick={() => {
          onChange(removeAnimatorParameter(controller, parameter.id));
          onDeleted();
        }}><EditorIcon name="delete" size="row-action" /></button>
      </header>
      <section className={inspectorSectionClass}>
        <header><strong>Live simulation</strong><span>{!preview.available ? "Offline" : preview.running ? "Running" : "Paused"}</span></header>
        {parameter.kind === "trigger" ? (
          <button type="button" className="primary-button compact" onClick={() => preview.setParameter(parameter.id, true)}>Fire {parameter.name}</button>
        ) : parameter.kind === "boolean" ? (
          <label className="animator-check"><EditorCheckbox checked={previewValue === true} onChange={(event) => preview.setParameter(parameter.id, event.currentTarget.checked)} /> Current value</label>
        ) : (
          <label>Current value<InspectorNumberInput
            value={typeof previewValue === "number" ? previewValue : 0}
            min={range?.[0]}
            max={range?.[1]}
            step={parameter.kind === "integer" ? 1 : 0.01}
            decimals={parameter.kind === "integer" ? 0 : 2}
            ariaLabel="Current parameter value"
            onChange={(value) => preview.setParameter(parameter.id, parameter.kind === "integer" ? Math.round(value) : value)}
          /></label>
        )}
      </section>
      {parameter.kind !== "trigger" && <section className={inspectorSectionClass}>
        <header><strong>Default</strong></header>
        {parameter.kind === "boolean" ? (
          <label className="animator-check"><EditorCheckbox checked={parameter.defaultValue} onChange={(event) => onChange(patchAnimatorParameter(controller, parameter.id, { defaultValue: event.currentTarget.checked }))} /> Starts enabled</label>
        ) : (
          <label>Default value<InspectorNumberInput
            value={parameter.defaultValue}
            step={parameter.kind === "integer" ? 1 : 0.01}
            decimals={parameter.kind === "integer" ? 0 : 2}
            ariaLabel="Default parameter value"
            onChange={(defaultValue) => onChange(patchAnimatorParameter(controller, parameter.id, { defaultValue }))}
          /></label>
        )}
      </section>}
    </div>
  );
}

function parameterKindLabel(kind: AnimatorController["parameters"][number]["kind"]): string {
  return ({ float: "Float", integer: "Int", boolean: "Bool", trigger: "Trigger" })[kind];
}

function blendParameterRange(controller: AnimatorController, parameterId: string): readonly [number, number] | undefined {
  const thresholds: number[] = [];
  visitAnimatorMotions(controller, (motion) => {
    if (motion.kind !== "blendTree") return;
    if (motion.tree.kind === "1d" && motion.tree.parameterId === parameterId) {
      thresholds.push(...motion.tree.children.map((child) => child.threshold));
    }
  });
  const minimum = Math.min(...thresholds);
  const maximum = Math.max(...thresholds);
  return minimum < maximum ? [minimum, maximum] : undefined;
}
