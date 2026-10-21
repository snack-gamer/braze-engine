import {
  addAnimatorParameter,
  patchAnimatorParameter,
  removeAnimatorParameter,
} from "../../application/animator-controller-authoring";
import type { AnimatorController } from "../../domain/animator-controller";
import type { AnimatorWorkspaceSelection } from "./animator-workspace-selection";
import { AnimatorParameterCreateMenu } from "./AnimatorParameterCreateMenu";
import { AnimatorParameterRow } from "./AnimatorParameterRow";
import type { AnimatorPreview } from "./useAnimatorPreview";

type AnimatorParameterRailProps = Readonly<{
  controller: AnimatorController;
  layerId: string;
  selection: AnimatorWorkspaceSelection;
  preview: AnimatorPreview;
  onSelect: (selection: AnimatorWorkspaceSelection) => void;
  onChange: (controller: AnimatorController) => void;
}>;

/** Owns Animator parameter creation, selection, rename, and deletion in the navigation rail. */
export function AnimatorParameterRail({
  controller,
  layerId,
  selection,
  preview,
  onSelect,
  onChange,
}: AnimatorParameterRailProps) {
  return (
    <section className="animator-rail-section animator-rail-section--parameters">
      <header><strong>Parameters</strong><div className="animator-parameter-actions">
        <span>{controller.parameters.length}</span>
        <AnimatorParameterCreateMenu onCreate={(kind) => {
          const next = addAnimatorParameter(controller, kind);
          const parameter = next.parameters[next.parameters.length - 1]!;
          onChange(next);
          onSelect({ kind: "parameter", layerId, parameterId: parameter.id });
        }} />
      </div></header>
      <div className="animator-rail-list">
        {controller.parameters.map((parameter) => (
          <AnimatorParameterRow
            key={parameter.id}
            parameter={parameter}
            valueLabel={formatNumber(preview.values[parameter.id])}
            selected={selection.kind === "parameter" && selection.parameterId === parameter.id}
            onSelect={() => onSelect({ kind: "parameter", layerId, parameterId: parameter.id })}
            onRename={(name) => onChange(patchAnimatorParameter(controller, parameter.id, { name }))}
            onDelete={() => {
              onChange(removeAnimatorParameter(controller, parameter.id));
              onSelect({ kind: "layer", layerId });
            }}
          />
        ))}
      </div>
    </section>
  );
}

function formatNumber(value: unknown): string {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return "—";
}
