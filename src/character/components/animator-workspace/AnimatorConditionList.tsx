import { InspectorNumberInput } from "../../../components/InspectorNumberInput";
import { EditorIcon } from "../../../ui/EditorIcon";
import {
  canAddAnimatorCondition,
  MAX_AUTHORED_ANIMATOR_CONDITIONS_PER_TRANSITION,
} from "../../application/animator-controller-authoring-limits";
import { conditionForParameter } from "../../application/animator-transition-authoring";
import type { AnimatorCondition, AnimatorParameter } from "../../domain/animator-parameters";
import { inspectorDangerButtonClass, inspectorSectionClass } from "./animator-inspector-classes";

type AnimatorConditionListProps = Readonly<{
  parameters: readonly AnimatorParameter[];
  conditions: readonly AnimatorCondition[];
  onChange: (conditions: AnimatorCondition[]) => void;
}>;

export function AnimatorConditionList({ parameters, conditions, onChange }: AnimatorConditionListProps) {
  return (
    <section className={`${inspectorSectionClass} animator-condition-list`}>
      <header><strong>Conditions</strong><button
        type="button"
        className="icon-button compact"
        disabled={parameters.length === 0 || !canAddAnimatorCondition(conditions.length)}
        title={!canAddAnimatorCondition(conditions.length)
          ? `Maximum ${MAX_AUTHORED_ANIMATOR_CONDITIONS_PER_TRANSITION} conditions reached.`
          : parameters.length === 0 ? "Create a Parameter before adding a condition." : "Add condition"}
        aria-label="Add transition condition"
        onClick={() => parameters[0] && onChange([...conditions, conditionForParameter(parameters[0])])}
      ><EditorIcon name="add" size="row-action" /></button></header>
      <p className="animator-condition-list__logic">
        All conditions must be true (AND). Use another connector for OR.
      </p>
      {conditions.map((condition, index) => {
        const parameter = parameters.find((candidate) => candidate.id === condition.parameterId);
        if (!parameter) return null;
        return (
          <div className="animator-condition-row" key={`${condition.parameterId}:${index}`}>
            <select
              aria-label={`Condition ${index + 1} parameter`}
              value={parameter.id}
              onChange={(event) => {
                const nextParameter = parameters.find((candidate) => candidate.id === event.currentTarget.value);
                if (nextParameter) onChange(conditions.map((candidate, candidateIndex) => (
                  candidateIndex === index ? conditionForParameter(nextParameter) : candidate
                )));
              }}
            >{parameters.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select>
            <select
              aria-label={`Condition ${index + 1} operator`}
              value={condition.mode}
              onChange={(event) => {
                const mode = event.currentTarget.value as AnimatorCondition["mode"];
                const next: AnimatorCondition = mode === "if" || mode === "ifNot" || mode === "triggered"
                  ? { parameterId: parameter.id, mode }
                  : { parameterId: parameter.id, mode, threshold: "threshold" in condition ? condition.threshold : 0 };
                onChange(conditions.map((candidate, candidateIndex) => candidateIndex === index ? next : candidate));
              }}
            >{modesFor(parameter, condition.mode).map((mode) => <option key={mode} value={mode}>{modeLabel(mode)}</option>)}</select>
            {"threshold" in condition && <InspectorNumberInput
              ariaLabel={`Condition ${index + 1} threshold`}
              step={parameter.kind === "integer" ? 1 : 0.01}
              decimals={parameter.kind === "integer" ? 0 : 2}
              value={condition.threshold}
              onChange={(value) => onChange(conditions.map((candidate, candidateIndex) => (
                candidateIndex === index && "threshold" in candidate
                  ? { ...candidate, threshold: parameter.kind === "integer"
                    ? Math.round(value)
                    : value }
                  : candidate
              )))}
            />}
            <button type="button" className={inspectorDangerButtonClass} title="Delete condition" onClick={() => (
              onChange(conditions.filter((_candidate, candidateIndex) => candidateIndex !== index))
            )}><EditorIcon name="delete" size="row-action" /></button>
          </div>
        );
      })}
      {conditions.length === 0 && <p className="animator-inspector-empty">
        {parameters.length === 0
          ? "Create a Parameter to control this connector."
          : "No parameter conditions."}
      </p>}
    </section>
  );
}

function modesFor(
  parameter: AnimatorParameter,
  current: AnimatorCondition["mode"],
): AnimatorCondition["mode"][] {
  if (parameter.kind === "boolean") return ["if", "ifNot"];
  if (parameter.kind === "trigger") return ["triggered"];
  const supported: AnimatorCondition["mode"][] = parameter.kind === "integer"
    ? ["greater", "less", "equals", "notEqual"]
    : ["greater", "less"];
  return supported.includes(current) ? supported : [current, ...supported];
}

function modeLabel(mode: AnimatorCondition["mode"]): string {
  return ({ if: "is true", ifNot: "is false", triggered: "fires", greater: ">", less: "<", equals: "=", notEqual: "≠" })[mode];
}
