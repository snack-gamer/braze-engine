import type { AssetRef } from "../../assets/domain/asset-reference";
import type { AnimatorComponent } from "../domain/animator-component";
import type { AnimatorController } from "../domain/animator-controller";
import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import type { AnimatorParameter } from "../domain/animator-parameters";
import { AnimatorAuthoringError } from "./animator-controller-authoring";

export const MAX_AUTHORED_ANIMATOR_PARAMETER_OVERRIDES =
  ANIMATOR_DOCUMENT_LIMITS.parameterOverridesPerComponent;

function normalizeParameterValue(
  parameter: AnimatorParameter,
  value: number | boolean,
): number | boolean {
  if (parameter.kind === "boolean" || parameter.kind === "trigger") return value === true;
  if (typeof value !== "number" || !Number.isFinite(value)) return parameter.defaultValue;
  return parameter.kind === "integer" ? Math.round(value) : value;
}

export function assignAnimatorControllerReference(
  component: AnimatorComponent,
  controllerRef: AssetRef | undefined,
): AnimatorComponent {
  return {
    ...component,
    controller: undefined,
    controllerRef: controllerRef ? { ...controllerRef } : undefined,
    parameterOverrides: [],
  };
}

/** Migrates a legacy reusable controller into scene-owned component state. */
export function embedAnimatorController(
  component: AnimatorComponent,
  controller: AnimatorController,
): AnimatorComponent {
  const embedded = structuredClone(controller);
  return {
    ...component,
    controller: embedded,
    controllerRef: undefined,
    parameterOverrides: component.parameterOverrides.filter((override) => (
      embedded.parameters.some((parameter) => parameter.id === override.parameterId)
    )),
  };
}

export function assignAnimatorAvatarReference(
  component: AnimatorComponent,
  avatarRef: AssetRef | undefined,
): AnimatorComponent {
  return { ...component, avatarRef: avatarRef ? { ...avatarRef } : undefined };
}

export function animatorParameterValue(
  component: AnimatorComponent,
  parameter: AnimatorParameter,
): number | boolean {
  const override = component.parameterOverrides.find((candidate) => candidate.parameterId === parameter.id);
  return override ? normalizeParameterValue(parameter, override.value) : parameter.defaultValue;
}

export function setAnimatorParameterOverride(
  component: AnimatorComponent,
  parameter: AnimatorParameter,
  value: number | boolean,
): AnimatorComponent {
  const next = { parameterId: parameter.id, value: normalizeParameterValue(parameter, value) };
  const replacesExisting = component.parameterOverrides.some(
    (candidate) => candidate.parameterId === parameter.id,
  );
  if (!replacesExisting
    && component.parameterOverrides.length >= MAX_AUTHORED_ANIMATOR_PARAMETER_OVERRIDES) {
    throw new AnimatorAuthoringError(
      `An Animator cannot exceed ${MAX_AUTHORED_ANIMATOR_PARAMETER_OVERRIDES} parameter overrides.`,
    );
  }
  return {
    ...component,
    parameterOverrides: [
      ...component.parameterOverrides.filter((candidate) => candidate.parameterId !== parameter.id),
      next,
    ],
  };
}

export function resetAnimatorParameterOverride(
  component: AnimatorComponent,
  parameterId: string,
): AnimatorComponent {
  return {
    ...component,
    parameterOverrides: component.parameterOverrides.filter((candidate) => candidate.parameterId !== parameterId),
  };
}
