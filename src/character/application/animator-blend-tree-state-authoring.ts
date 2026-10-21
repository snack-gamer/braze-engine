import { createAuthoredId } from "../../identity/authored-id";
import type { AnimatorController } from "../domain/animator-controller";
import type { AnimatorBlendTree, AnimatorMotion } from "../domain/blend-tree";
import { findAnimatorState } from "../domain/animator-state-machine";
import {
  addAnimatorParameter,
  addAnimatorState,
  AnimatorAuthoringError,
  setAnimatorStateMotion,
} from "./animator-controller-authoring";
import { MAX_AUTHORED_ANIMATOR_PARAMETERS } from "./animator-controller-authoring-limits";
import { createAnimatorMotion } from "./animator-motion-authoring";
import {
  addAnimatorStateToStateMachine,
  setAnimatorStateMachineStateMotion,
} from "./animator-state-machine-authoring";

export type AnimatorBlendTreeStateScope = Readonly<{
  layerId: string;
  stateMachineId?: string;
}>;

type AnimatorBlendTreeStateBinding =
  | Readonly<{ kind: "1d"; parameterId: string }>
  | Readonly<{
      kind: "2dSimpleDirectional" | "2dFreeformDirectional" | "2dFreeformCartesian";
      parameterXId: string;
      parameterYId: string;
    }>;

export type AnimatorBlendTreeStateOptions = Readonly<{
  stateId?: string;
  name?: string;
  makeDefault?: boolean;
}> & AnimatorBlendTreeStateBinding;

export type AnimatorBlendTreeStateResult = Readonly<{
  controller: AnimatorController;
  stateId: string;
}>;

type DefaultBlendTreeKind = Exclude<AnimatorBlendTree["kind"], "direct">;

export type DefaultAnimatorBlendTreeStateOptions = Readonly<{
  kind: DefaultBlendTreeKind;
  stateId?: string;
  name?: string;
  makeDefault?: boolean;
}>;

/** Reports whether missing Float parameters can be authored for a Blend Tree kind. */
export function canPrepareAnimatorBlendTreeKind(
  controller: AnimatorController,
  kind: AnimatorBlendTree["kind"],
): boolean {
  return requiredFloatParameterCount(kind) <= MAX_AUTHORED_ANIMATOR_PARAMETERS
    - controller.parameters.filter((parameter) => parameter.kind !== "float").length;
}

/** Creates a Blend Tree state and supplies any Float parameters its axes still need. */
export function addAnimatorBlendTreeStateWithDefaultParameters(
  controller: AnimatorController,
  scope: AnimatorBlendTreeStateScope,
  options: DefaultAnimatorBlendTreeStateOptions,
): AnimatorBlendTreeStateResult {
  const [prepared, parameterIds] = prepareAnimatorBlendTreeParameters(controller, options.kind);
  if (options.kind === "1d") {
    return addAnimatorBlendTreeState(prepared, scope, {
      ...options,
      parameterId: parameterIds[0]!,
    } as AnimatorBlendTreeStateOptions);
  }
  return addAnimatorBlendTreeState(prepared, scope, {
    ...options,
    parameterXId: parameterIds[0]!,
    parameterYId: parameterIds[1]!,
  } as AnimatorBlendTreeStateOptions);
}

/** Replaces a Blend Tree state's root kind while keeping parameter setup self-contained. */
export function replaceAnimatorBlendTreeStateKind(
  controller: AnimatorController,
  layerId: string,
  stateId: string,
  kind: AnimatorBlendTree["kind"],
): AnimatorController {
  const layer = controller.layers.find((candidate) => candidate.id === layerId);
  const location = layer && findAnimatorState(layer, stateId);
  if (!location || location.state.motion?.kind !== "blendTree") {
    throw new AnimatorAuthoringError(`Animator state '${stateId}' is not a Blend Tree.`);
  }
  if (location.state.motion.tree.kind === kind) return controller;
  const [prepared, parameterIds] = prepareAnimatorBlendTreeParameters(controller, kind);
  const motion = createAnimatorMotion(kind, {
    parameterId: parameterIds[0],
    parameterYId: parameterIds[1],
  })!;
  return location.ownerMachineId
    ? setAnimatorStateMachineStateMotion(
        prepared,
        layerId,
        location.ownerMachineId,
        stateId,
        motion,
      )
    : setAnimatorStateMotion(prepared, layerId, stateId, motion);
}

/** Adds an empty Blend Tree state bound directly to existing Float parameters. */
export function addAnimatorBlendTreeState(
  controller: AnimatorController,
  scope: AnimatorBlendTreeStateScope,
  options: AnimatorBlendTreeStateOptions,
): AnimatorBlendTreeStateResult {
  const motion = blendTreeMotion(controller, options);
  const stateId = options.stateId ?? createAuthoredId("animator-state");
  const stateOptions = {
    id: stateId,
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.makeDefault === undefined ? {} : { makeDefault: options.makeDefault }),
  };
  if (scope.stateMachineId) {
    const withState = addAnimatorStateToStateMachine(
      controller,
      scope.layerId,
      scope.stateMachineId,
      stateOptions,
    );
    return {
      controller: setAnimatorStateMachineStateMotion(
        withState,
        scope.layerId,
        scope.stateMachineId,
        stateId,
        motion,
      ),
      stateId,
    };
  }
  const withState = addAnimatorState(controller, scope.layerId, stateOptions);
  return {
    controller: setAnimatorStateMotion(withState, scope.layerId, stateId, motion),
    stateId,
  };
}

function blendTreeMotion(
  controller: AnimatorController,
  binding: AnimatorBlendTreeStateBinding,
): AnimatorMotion {
  if (binding.kind === "1d") {
    return createAnimatorMotion("1d", {
      parameterId: requiredFloatParameterId(controller, binding.parameterId, "1D blend parameter"),
    })!;
  }
  const parameterXId = requiredFloatParameterId(controller, binding.parameterXId, "2D X blend parameter");
  const parameterYId = requiredFloatParameterId(controller, binding.parameterYId, "2D Y blend parameter");
  if (parameterXId === parameterYId) {
    throw new AnimatorAuthoringError("2D blend axes must use different Float parameters.");
  }
  return createAnimatorMotion(binding.kind, { parameterId: parameterXId, parameterYId })!;
}

function requiredFloatParameterId(
  controller: AnimatorController,
  parameterId: string,
  label: string,
): string {
  const id = parameterId.trim();
  if (!id) throw new AnimatorAuthoringError(`${label} is required.`);
  const parameter = controller.parameters.find((candidate) => candidate.id === id);
  if (!parameter) throw new AnimatorAuthoringError(`Animator parameter '${id}' was not found.`);
  if (parameter.kind !== "float") {
    throw new AnimatorAuthoringError(`Animator parameter '${id}' must be a Float parameter.`);
  }
  return parameter.id;
}

function prepareAnimatorBlendTreeParameters(
  source: AnimatorController,
  kind: AnimatorBlendTree["kind"],
): readonly [AnimatorController, readonly string[]] {
  const required = requiredFloatParameterCount(kind);
  let controller = source;
  const parameterIds = controller.parameters
    .filter((parameter) => parameter.kind === "float")
    .map((parameter) => parameter.id)
    .slice(0, required);
  const generatedNames = required === 1 ? ["Blend"] : ["Blend X", "Blend Y"];
  while (parameterIds.length < required) {
    controller = addAnimatorParameter(controller, "float", {
      name: generatedNames[parameterIds.length]!,
    });
    parameterIds.push(controller.parameters[controller.parameters.length - 1]!.id);
  }
  return [controller, parameterIds];
}

function requiredFloatParameterCount(kind: AnimatorBlendTree["kind"]): number {
  return kind === "direct" ? 0 : kind === "1d" ? 1 : 2;
}
