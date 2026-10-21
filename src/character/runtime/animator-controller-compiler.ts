import type {
  AnimatorController,
  AnimatorLayer,
  AnimatorState,
} from "../domain/animator-controller";
import type { AnimatorCondition, AnimatorParameter } from "../domain/animator-parameters";
import type {
  RuntimeAnimatorCondition,
  RuntimeAnimatorControllerDefinition,
  RuntimeAnimatorLayerDefinition,
  RuntimeAnimatorParameterDefinition,
  RuntimeAnimatorStateDefinition,
  RuntimeAnimatorTransitionDefinition,
} from "./animator-runtime";
import {
  assetRefKey,
  compileAnimatorMotion,
  type AnimatorClipDurationResolver,
} from "./animator-motion-compiler";
import { validateRuntimeAnimatorController } from "./animator-runtime-validation";
import {
  characterRuntimeSuccess,
  hasCharacterRuntimeErrors,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "./diagnostics";
import {
  MAX_RUNTIME_ANIMATOR_LAYERS,
  MAX_RUNTIME_ANIMATOR_PARAMETERS,
} from "./animator-runtime-limits";
import {
  planAnimatorLayerStateMachine,
  type PlannedAnimatorTransition,
} from "./animator-state-machine-compilation";

export {
  assetRefKey,
  type AnimatorClipDurationResolver,
  type AnimatorClipRuntimeMetadata,
} from "./animator-motion-compiler";

/** Compiles authored controller assets into immutable runtime lookup data. */
export function compileAnimatorController(
  source: AnimatorController,
  clipDuration: AnimatorClipDurationResolver,
): CharacterRuntimeResult<RuntimeAnimatorControllerDefinition> {
  const diagnostics: CharacterRuntimeDiagnostic[] = [];
  diagnostics.push(...authoredGraphBudgetDiagnostics(source));
  if (hasCharacterRuntimeErrors(diagnostics)) return { value: null, diagnostics };
  const parameters = source.parameters.map(runtimeParameter);
  const parameterIds = new Set(source.parameters.map((parameter) => parameter.id));
  const layers = source.layers.map((layer, layerIndex) => compileLayer(
    layer,
    layerIndex,
    clipDuration,
    parameterIds,
    diagnostics,
  ));
  const compiled: RuntimeAnimatorControllerDefinition = {
    id: source.id,
    revision: source.revision ?? assetRefKey(source.sourceRef) ?? "unversioned",
    parameters,
    layers,
  };
  appendUniqueDiagnostics(diagnostics, validateRuntimeAnimatorController(compiled));
  if (hasCharacterRuntimeErrors(diagnostics)) return { value: null, diagnostics };
  return characterRuntimeSuccess(compiled, diagnostics);
}

function authoredGraphBudgetDiagnostics(source: AnimatorController): CharacterRuntimeDiagnostic[] {
  const diagnostics: CharacterRuntimeDiagnostic[] = [];
  if (source.parameters.length > MAX_RUNTIME_ANIMATOR_PARAMETERS) diagnostics.push({
    code: "animator-parameter-budget-exceeded",
    severity: "error",
    message: `Animator Controllers cannot exceed ${MAX_RUNTIME_ANIMATOR_PARAMETERS} parameters.`,
  });
  if (source.layers.length > MAX_RUNTIME_ANIMATOR_LAYERS) diagnostics.push({
    code: "animator-layer-budget-exceeded",
    severity: "error",
    message: `Animator Controllers cannot exceed ${MAX_RUNTIME_ANIMATOR_LAYERS} layers.`,
  });
  return diagnostics;
}

function compileLayer(
  layer: AnimatorLayer,
  layerIndex: number,
  clipDuration: AnimatorClipDurationResolver,
  parameterIds: ReadonlySet<string>,
  diagnostics: CharacterRuntimeDiagnostic[],
): RuntimeAnimatorLayerDefinition {
  const plan = planAnimatorLayerStateMachine(layer);
  diagnostics.push(...plan.diagnostics);
  const defaultState = plan.states.find((state) => state.id === plan.initialStateId);
  if (defaultState && !defaultState.motion) diagnostics.push({
    code: "missing-default-state-motion",
    severity: "warning",
    message: `Default state ${defaultState.name} on layer ${layer.name} has no Animation Clip or Blend Tree.`,
    details: { layerId: layer.id, stateId: defaultState.id },
  });
  const durations = new Map<string, number>();
  const states = plan.states.map((state) => compileState(
    state,
    clipDuration,
    parameterIds,
    diagnostics,
    durations,
  ));
  const transitions: RuntimeAnimatorTransitionDefinition[] = [];
  for (const transition of plan.transitions) {
    const compiled = compileTransition(
      transition,
      durations.get(transition.sourceStateId) ?? 1,
      layerIndex > 0,
      diagnostics,
    );
    if (compiled) transitions.push(compiled);
  }
  return {
    id: layer.id,
    initialStateId: plan.initialStateId,
    weight: layer.weight,
    blendMode: layer.blendingMode,
    maskId: assetRefKey(layer.avatarMaskRef),
    ikPass: layer.ikPass,
    ...(layer.syncedLayerId ? { syncedLayerId: layer.syncedLayerId } : {}),
    syncedLayerAffectsTiming: layer.syncedLayerAffectsTiming === true,
    states,
    transitions,
  };
}

function compileState(
  state: AnimatorState,
  clipDuration: AnimatorClipDurationResolver,
  parameterIds: ReadonlySet<string>,
  diagnostics: CharacterRuntimeDiagnostic[],
  durations: Map<string, number>,
): RuntimeAnimatorStateDefinition {
  for (const parameterId of [state.speedParameterId, state.cycleOffsetParameterId]) {
    if (parameterId && !parameterIds.has(parameterId)) diagnostics.push({
      code: "missing-state-parameter",
      severity: "error",
      message: `Animator state ${state.name} references missing parameter ${parameterId}.`,
    });
  }
  if (!Number.isFinite(state.speed) || !Number.isFinite(state.cycleOffset)) diagnostics.push({
    code: "invalid-state-timing",
    severity: "error",
    message: `Animator state ${state.name} requires finite speed and cycle offset values.`,
  });
  const compiledMotion = compileAnimatorMotion(state.motion, clipDuration);
  diagnostics.push(...compiledMotion.diagnostics);
  const motion = compiledMotion.value ?? { motion: null, durationSeconds: 1, looping: false };
  const durationSeconds = Math.max(1.0e-6, motion.durationSeconds);
  durations.set(state.id, durationSeconds);
  return {
    id: state.id,
    motion: motion.motion,
    durationSeconds,
    speed: Number.isFinite(state.speed) ? state.speed : 1,
    ...(state.speedParameterId ? { speedParameter: state.speedParameterId } : {}),
    cycleOffset: Number.isFinite(state.cycleOffset) ? state.cycleOffset : 0,
    ...(state.cycleOffsetParameterId ? { cycleOffsetParameter: state.cycleOffsetParameterId } : {}),
    loop: motion.looping,
    mirror: state.mirror,
    footIk: state.footIk,
    writeDefaults: state.writeDefaults,
    events: state.events.map((event) => ({ ...event, payload: { ...event.payload } })),
  };
}

function compileTransition(
  planned: PlannedAnimatorTransition,
  sourceDurationSeconds: number,
  allowExit: boolean,
  diagnostics: CharacterRuntimeDiagnostic[],
): RuntimeAnimatorTransitionDefinition | null {
  const transition = planned.transition;
  if (planned.destinationStateId === null && !allowExit) {
    diagnostics.push({
      code: "base-layer-exit-transition",
      severity: "error",
      message: `Transition ${transition.id} cannot exit the base Animator layer.`,
    });
    return null;
  }
  return {
    id: planned.id,
    sourceStateId: planned.sourceStateId,
    destinationStateId: planned.destinationStateId,
    durationSeconds: Math.max(0, transition.durationMode === "normalized"
      ? transition.duration * sourceDurationSeconds
      : transition.duration),
    destinationOffsetNormalized: transition.offsetNormalized,
    exitTimeNormalized: transition.hasExitTime ? transition.exitTimeNormalized : undefined,
    conditions: planned.conditions.map(runtimeCondition),
    allowSelfTransition: transition.canTransitionToSelf,
    interruptionSource: transition.interruptionSource,
    orderedInterruption: transition.orderedInterruption,
    fromAnyState: planned.fromAnyState,
    authoringOrder: planned.authoringOrder,
  };
}

function runtimeParameter(parameter: AnimatorParameter): RuntimeAnimatorParameterDefinition {
  if (parameter.kind === "integer") return { name: parameter.id, type: "int", defaultValue: parameter.defaultValue };
  if (parameter.kind === "boolean") return { name: parameter.id, type: "bool", defaultValue: parameter.defaultValue };
  if (parameter.kind === "trigger") return { name: parameter.id, type: "trigger", defaultValue: false };
  return { name: parameter.id, type: "float", defaultValue: parameter.defaultValue };
}

function runtimeCondition(condition: AnimatorCondition): RuntimeAnimatorCondition {
  if (condition.mode === "if") return { parameter: condition.parameterId, operator: "equals", value: true };
  if (condition.mode === "ifNot") return { parameter: condition.parameterId, operator: "equals", value: false };
  if (condition.mode === "triggered") return { parameter: condition.parameterId, operator: "triggered" };
  const operators = { greater: "greater", less: "less", equals: "equals", notEqual: "notEquals" } as const;
  return {
    parameter: condition.parameterId,
    operator: operators[condition.mode],
    value: "threshold" in condition ? condition.threshold : 0,
  };
}

function appendUniqueDiagnostics(
  target: CharacterRuntimeDiagnostic[],
  additions: readonly CharacterRuntimeDiagnostic[],
): void {
  const existing = new Set(target.map((item) => `${item.code}\u0000${item.message}`));
  const invalidEntryLayers = new Set(target.flatMap((item) => (
    item.code === "invalid-state-machine-entry" && typeof item.details?.layerId === "string"
      ? [item.details.layerId]
      : []
  )));
  for (const diagnostic of additions) {
    if (diagnostic.code === "invalid-animator-state"
      && typeof diagnostic.details?.layerId === "string"
      && invalidEntryLayers.has(diagnostic.details.layerId)) continue;
    const key = `${diagnostic.code}\u0000${diagnostic.message}`;
    if (existing.has(key)) continue;
    existing.add(key);
    target.push(diagnostic);
  }
}
