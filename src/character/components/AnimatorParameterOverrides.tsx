import { InspectorRow } from "../../components/InspectorRow";
import { InspectorNumberInput } from "../../components/InspectorNumberInput";
import { EditorIcon } from "../../ui/EditorIcon";
import {
  animatorParameterValue,
  resetAnimatorParameterOverride,
  setAnimatorParameterOverride,
} from "../application/animator-component-authoring";
import type { AnimatorComponent } from "../domain/animator-component";
import type { AnimatorParameter } from "../domain/animator-parameters";

type AnimatorParameterOverridesProps = Readonly<{
  component: AnimatorComponent;
  parameters: readonly AnimatorParameter[];
  update: (component: AnimatorComponent) => void;
}>;

export function AnimatorParameterOverrides({
  component,
  parameters,
  update,
}: AnimatorParameterOverridesProps) {
  if (parameters.length === 0) return null;
  const overridden = new Set(component.parameterOverrides.map((candidate) => candidate.parameterId));
  return (
    <section className="animator-parameter-overrides">
      <header><span>Parameter Overrides</span><small>{overridden.size} changed</small></header>
      {parameters.map((parameter) => (
        <InspectorRow
          key={parameter.id}
          label={parameter.name}
          actions={overridden.has(parameter.id) ? (
            <button
              type="button"
              className="icon-button compact"
              title={`Reset ${parameter.name}`}
              onClick={() => update(resetAnimatorParameterOverride(component, parameter.id))}
            ><EditorIcon name="refresh" size="row-action" /></button>
          ) : undefined}
        >
          <ParameterValue
            parameter={parameter}
            value={animatorParameterValue(component, parameter)}
            onChange={(value) => update(setAnimatorParameterOverride(component, parameter, value))}
          />
        </InspectorRow>
      ))}
    </section>
  );
}

function ParameterValue({
  parameter,
  value,
  onChange,
}: Readonly<{
  parameter: AnimatorParameter;
  value: number | boolean;
  onChange: (value: number | boolean) => void;
}>) {
  if (parameter.kind === "boolean" || parameter.kind === "trigger") {
    return (
      <label className="animator-override-boolean">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span>{parameter.kind === "trigger" ? "Set on Start" : value ? "True" : "False"}</span>
      </label>
    );
  }
  return (
    <InspectorNumberInput
      step={parameter.kind === "integer" ? 1 : 0.01}
      decimals={parameter.kind === "integer" ? 0 : 2}
      value={typeof value === "number" ? value : parameter.defaultValue}
      ariaLabel={`${parameter.name} override`}
      onChange={onChange}
    />
  );
}
