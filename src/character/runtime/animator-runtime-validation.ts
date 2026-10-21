import type {
  RuntimeAnimatorCondition,
  RuntimeAnimatorControllerDefinition,
  RuntimeAnimatorMotion,
  RuntimeAnimatorParameterDefinition,
  RuntimeAnimatorStateEventDefinition,
} from "./animator-runtime";
import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import { validateBlendTree2dLayout } from "./blend-tree-2d";
import type { CharacterRuntimeDiagnostic } from "./diagnostics";
import { MAX_AUTHORED_STATE_EVENTS_PER_STATE } from "./animator-state-events";
import {
  MAX_RUNTIME_ANIMATOR_CONDITIONS_PER_TRANSITION,
  MAX_RUNTIME_ANIMATOR_LAYERS,
  MAX_RUNTIME_ANIMATOR_PARAMETERS,
  MAX_RUNTIME_ANIMATOR_STATES_PER_LAYER,
  MAX_RUNTIME_ANIMATOR_TRANSITIONS_PER_LAYER,
} from "./animator-runtime-limits";

const MAX_VALIDATED_BLEND_TREE_DEPTH = ANIMATOR_DOCUMENT_LIMITS.blendTreeDepth;

export function validateRuntimeAnimatorController(
  controller: RuntimeAnimatorControllerDefinition,
): CharacterRuntimeDiagnostic[] {
  const diagnostics: CharacterRuntimeDiagnostic[] = [];
  if (!controller.id || !controller.revision) {
    diagnostics.push(error("invalid-animator-controller", "Animator runtime identity must be non-empty."));
  }
  if (controller.parameters.length > MAX_RUNTIME_ANIMATOR_PARAMETERS) diagnostics.push(error(
    "animator-parameter-budget-exceeded",
    `Animator Controllers cannot exceed ${MAX_RUNTIME_ANIMATOR_PARAMETERS} parameters.`,
  ));
  if (controller.layers.length > MAX_RUNTIME_ANIMATOR_LAYERS) diagnostics.push(error(
    "animator-layer-budget-exceeded",
    `Animator Controllers cannot exceed ${MAX_RUNTIME_ANIMATOR_LAYERS} layers.`,
  ));
  const parameters = validateParameters(
    controller.parameters.slice(0, MAX_RUNTIME_ANIMATOR_PARAMETERS),
    diagnostics,
  );
  const declaredLayers = controller.layers.slice(0, MAX_RUNTIME_ANIMATOR_LAYERS);
  const declaredLayerIds = new Set(declaredLayers.map((layer) => layer.id));
  const layerIds = new Set<string>();
  for (let layerIndex = 0; layerIndex < declaredLayers.length; layerIndex += 1) {
    const layer = declaredLayers[layerIndex]!;
    if (!layer.id || layerIds.has(layer.id)) {
      diagnostics.push(error("duplicate-animator-layer", "Animator layer IDs must be non-empty and unique."));
      continue;
    }
    layerIds.add(layer.id);
    if (layer.syncedLayerId && (
      layerIndex === 0
      || layer.syncedLayerId === layer.id
      || !declaredLayerIds.has(layer.syncedLayerId)
    )) diagnostics.push(error(
      "invalid-synchronized-layer",
      `Layer ${layer.id} references an invalid synchronized source layer.`,
    ));
    if (!Number.isFinite(layer.weight) || layer.weight < 0) {
      diagnostics.push(error("invalid-animator-layer-weight", `Layer ${layer.id} has an invalid weight.`));
    }
    if (layer.states.length > MAX_RUNTIME_ANIMATOR_STATES_PER_LAYER) diagnostics.push(error(
      "animator-state-budget-exceeded",
      `Layer ${layer.id} cannot exceed ${MAX_RUNTIME_ANIMATOR_STATES_PER_LAYER} states.`,
    ));
    if (layer.transitions.length > MAX_RUNTIME_ANIMATOR_TRANSITIONS_PER_LAYER) diagnostics.push(error(
      "animator-transition-budget-exceeded",
      `Layer ${layer.id} cannot exceed ${MAX_RUNTIME_ANIMATOR_TRANSITIONS_PER_LAYER} transitions.`,
    ));
    const validatedStates = layer.states.slice(0, MAX_RUNTIME_ANIMATOR_STATES_PER_LAYER);
    const states = new Map(validatedStates.map((state) => [state.id, state]));
    if (states.size !== validatedStates.length || !states.has(layer.initialStateId)) {
      diagnostics.push({
        ...error("invalid-animator-state", `Layer ${layer.id} has duplicate states or an invalid initial state.`),
        details: { layerId: layer.id },
      });
    }
    for (const state of validatedStates) {
      if (!state.id || !Number.isFinite(state.durationSeconds) || state.durationSeconds <= 0
        || !Number.isFinite(state.speed)
        || !Number.isFinite(state.cycleOffset ?? 0)) {
        diagnostics.push(error("invalid-animator-state", `State ${state.id || "<unnamed>"} has invalid timing.`));
      }
      validateNumericParameterReference(
        state.speedParameter,
        `State ${state.id} speed`,
        parameters,
        diagnostics,
      );
      validateNumericParameterReference(
        state.cycleOffsetParameter,
        `State ${state.id} cycle offset`,
        parameters,
        diagnostics,
      );
      validateStateEvents(state.id, state.events ?? [], diagnostics);
      validateMotion(layer.id, state.id, state.motion, parameters, diagnostics, new WeakSet<object>(), 0);
    }
    validateTransitions(
      layer.id,
      layer.transitions.slice(0, MAX_RUNTIME_ANIMATOR_TRANSITIONS_PER_LAYER),
      states,
      parameters,
      layerIndex > 0,
      diagnostics,
    );
  }
  validateSynchronizedLayers(declaredLayers, diagnostics);
  return diagnostics;
}

function validateParameters(
  definitions: readonly RuntimeAnimatorParameterDefinition[],
  diagnostics: CharacterRuntimeDiagnostic[],
): Map<string, RuntimeAnimatorParameterDefinition> {
  const parameters = new Map<string, RuntimeAnimatorParameterDefinition>();
  for (const parameter of definitions) {
    if (!parameter.name || parameters.has(parameter.name)) {
      diagnostics.push(error("invalid-animator-parameter", "Animator parameter names must be non-empty and unique."));
      continue;
    }
    const validDefault = parameter.type === "bool" || parameter.type === "trigger"
      ? typeof parameter.defaultValue === "boolean" && (parameter.type !== "trigger" || !parameter.defaultValue)
      : typeof parameter.defaultValue === "number" && Number.isFinite(parameter.defaultValue)
        && (parameter.type !== "int" || Number.isInteger(parameter.defaultValue));
    if (!validDefault) diagnostics.push(error(
      "invalid-animator-parameter-default",
      `Animator parameter ${parameter.name} has an invalid default value.`,
    ));
    parameters.set(parameter.name, parameter);
  }
  return parameters;
}

function validateMotion(
  layerId: string,
  stateId: string,
  motion: RuntimeAnimatorMotion | null,
  parameters: ReadonlyMap<string, RuntimeAnimatorParameterDefinition>,
  diagnostics: CharacterRuntimeDiagnostic[],
  active: WeakSet<object>,
  depth: number,
): void {
  if (!motion) return;
  if (depth > MAX_VALIDATED_BLEND_TREE_DEPTH) {
    diagnostics.push(error("blend-tree-depth-exceeded", `State ${stateId} exceeds the blend-tree depth limit.`));
    return;
  }
  if (motion.kind === "clip") {
    if (!motion.clipId || !validMotionTiming(motion.durationSeconds, motion.timeScale)) {
      diagnostics.push(error("invalid-runtime-clip", `State ${stateId} has invalid clip timing or identity.`));
    }
    validateNumericParameterReference(
      motion.timeScaleParameter,
      `State ${stateId} clip time scale`,
      parameters,
      diagnostics,
    );
    return;
  }
  if (active.has(motion)) {
    diagnostics.push(error("cyclic-runtime-blend-tree", `State ${stateId} contains a cyclic runtime blend tree.`));
    return;
  }
  active.add(motion);
  let parameterNames: readonly string[];
  if (motion.kind === "blendTree1d") parameterNames = [motion.parameter];
  else if (motion.kind === "blendTree2d") parameterNames = [motion.parameterX, motion.parameterY];
  else parameterNames = motion.children.map((child) => child.weightParameter);
  if (motion.kind === "blendTree2d" && motion.parameterX === motion.parameterY) diagnostics.push(error(
    "duplicate-2d-blend-parameter",
    `State ${stateId} must use different parameters for the two blend axes.`,
  ));
  for (const parameterName of parameterNames) {
    validateNumericParameterReference(
      parameterName,
      `State ${stateId} blend motion`,
      parameters,
      diagnostics,
      "missing-blend-parameter",
    );
  }
  if (motion.kind === "blendTreeDirect" && typeof motion.normalizeWeights !== "boolean") diagnostics.push(error(
    "invalid-direct-blend-tree",
    `State ${stateId} has an invalid Direct normalization flag.`,
  ));
  if (motion.children.length === 0) {
    diagnostics.push({
      ...error(
        "empty-blend-tree",
        `Blend Tree in state ${stateId} has no child motions. Add at least one Animation Clip.`,
      ),
      details: { layerId, stateId },
    });
    active.delete(motion);
    return;
  }
  const childIds = new Set<string>();
  const thresholds = new Set<number>();
  for (const child of motion.children) {
    if (!child.id || childIds.has(child.id) || !Number.isFinite(child.timeScale) || child.timeScale === 0) {
      diagnostics.push(error("invalid-blend-child", `State ${stateId} has an invalid or duplicate blend child.`));
    }
    childIds.add(child.id);
    if (motion.kind === "blendTree1d") {
      const threshold = "threshold" in child ? child.threshold : Number.NaN;
      if (!Number.isFinite(threshold)) diagnostics.push(error(
        "invalid-blend-child",
        `State ${stateId} has a non-finite 1D threshold.`,
      ));
      if (thresholds.has(threshold)) diagnostics.push(error(
        "duplicate-blend-threshold",
        `State ${stateId} repeats threshold ${threshold}.`,
      ));
      thresholds.add(threshold);
    }
    if (motion.kind === "blendTreeDirect"
      && (!("weightParameter" in child) || !child.weightParameter)) diagnostics.push(error(
      "invalid-direct-blend-parameter",
      `State ${stateId} has a Direct child without a weight parameter.`,
    ));
    validateMotion(layerId, stateId, child.motion, parameters, diagnostics, active, depth + 1);
  }
  if (motion.kind === "blendTree2d") diagnostics.push(...validateBlendTree2dLayout(
    motion.algorithm,
    motion.children.map((child) => ({ motionId: child.id, position: child.position })),
  ));
  active.delete(motion);
}

function validateTransitions(
  layerId: string,
  transitions: RuntimeAnimatorControllerDefinition["layers"][number]["transitions"],
  states: ReadonlyMap<string, unknown>,
  parameters: ReadonlyMap<string, RuntimeAnimatorParameterDefinition>,
  allowExit: boolean,
  diagnostics: CharacterRuntimeDiagnostic[],
): void {
  const ids = new Set<string>();
  for (const transition of transitions) {
    if (!transition.id || ids.has(transition.id)) {
      diagnostics.push(error("duplicate-animator-transition", `Layer ${layerId} has duplicate transition IDs.`));
    }
    ids.add(transition.id);
    if ((transition.destinationStateId !== null && !states.has(transition.destinationStateId))
      || (transition.sourceStateId !== "*" && !states.has(transition.sourceStateId))) {
      diagnostics.push(error("invalid-animator-transition", `Transition ${transition.id} references a missing state.`));
    }
    if (transition.destinationStateId === null && !allowExit) diagnostics.push(error(
      "base-layer-exit-transition",
      `Transition ${transition.id} cannot exit the base Animator layer.`,
    ));
    if (!Number.isFinite(transition.durationSeconds) || transition.durationSeconds < 0
      || (transition.destinationOffsetNormalized !== undefined
        && (!Number.isFinite(transition.destinationOffsetNormalized)
          || transition.destinationOffsetNormalized < 0))
      || (transition.exitTimeNormalized !== undefined
        && (!Number.isFinite(transition.exitTimeNormalized) || transition.exitTimeNormalized < 0))) {
      diagnostics.push(error("invalid-animator-transition", `Transition ${transition.id} has invalid timing.`));
    }
    if (transition.conditions.length > MAX_RUNTIME_ANIMATOR_CONDITIONS_PER_TRANSITION) diagnostics.push(error(
      "animator-condition-budget-exceeded",
      `Transition ${transition.id} cannot exceed ${MAX_RUNTIME_ANIMATOR_CONDITIONS_PER_TRANSITION} conditions.`,
    ));
    for (const condition of transition.conditions.slice(0, MAX_RUNTIME_ANIMATOR_CONDITIONS_PER_TRANSITION)) {
      validateCondition(transition.id, condition, parameters, diagnostics);
    }
  }
}

function validateSynchronizedLayers(
  layers: readonly RuntimeAnimatorControllerDefinition["layers"][number][],
  diagnostics: CharacterRuntimeDiagnostic[],
): void {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  for (const layer of layers) {
    if (!layer.syncedLayerId) continue;
    const source = byId.get(layer.syncedLayerId);
    if (!source) continue;
    const overrideStates = new Set(layer.states.map((state) => state.id));
    const missing = source.states.find((state) => !overrideStates.has(state.id));
    if (missing) diagnostics.push(error(
      "synchronized-layer-state-mismatch",
      `Layer ${layer.id} has no motion override for synchronized state ${missing.id}.`,
    ));
    const visited = new Set<string>([layer.id]);
    let cursor: typeof source | undefined = source;
    while (cursor?.syncedLayerId) {
      if (visited.has(cursor.id)) {
        diagnostics.push(error(
          "cyclic-synchronized-layer",
          `Layer ${layer.id} participates in a synchronized-layer cycle.`,
        ));
        break;
      }
      visited.add(cursor.id);
      cursor = byId.get(cursor.syncedLayerId);
    }
  }
}

function validateNumericParameterReference(
  parameterName: string | undefined,
  purpose: string,
  parameters: ReadonlyMap<string, RuntimeAnimatorParameterDefinition>,
  diagnostics: CharacterRuntimeDiagnostic[],
  code = "missing-state-timing-parameter",
): void {
  if (!parameterName) return;
  const parameter = parameters.get(parameterName);
  if (!parameter || (parameter.type !== "float" && parameter.type !== "int")) diagnostics.push(error(
    code,
    `${purpose} requires numeric parameter ${parameterName}.`,
  ));
}

function validateStateEvents(
  stateId: string,
  events: readonly RuntimeAnimatorStateEventDefinition[],
  diagnostics: CharacterRuntimeDiagnostic[],
): void {
  if (events.length > MAX_AUTHORED_STATE_EVENTS_PER_STATE) diagnostics.push(error(
    "state-event-budget-exceeded",
    `State ${stateId} cannot contain more than ${MAX_AUTHORED_STATE_EVENTS_PER_STATE} events.`,
  ));
  const ids = new Set<string>();
  for (const event of events) {
    if (!event.id || ids.has(event.id) || !event.name
      || !Number.isFinite(event.timeNormalized)
      || event.timeNormalized < 0 || event.timeNormalized > 1
      || !validStateEventPayload(event.payload)) {
      diagnostics.push(error(
        "invalid-state-event",
        `State ${stateId} has an invalid or duplicate authored event.`,
      ));
    }
    ids.add(event.id);
  }
}

function validStateEventPayload(
  payload: RuntimeAnimatorStateEventDefinition["payload"],
): boolean {
  return payload !== null && !Array.isArray(payload) && Object.values(payload).every((value) => (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
  ));
}

function validateCondition(
  transitionId: string,
  condition: RuntimeAnimatorCondition,
  parameters: ReadonlyMap<string, RuntimeAnimatorParameterDefinition>,
  diagnostics: CharacterRuntimeDiagnostic[],
): void {
  const parameter = parameters.get(condition.parameter);
  if (!parameter) {
    diagnostics.push(error("missing-condition-parameter", `Transition ${transitionId} references missing parameter ${condition.parameter}.`));
    return;
  }
  if (condition.operator === "triggered") {
    if (parameter.type !== "trigger") diagnostics.push(error(
      "invalid-condition-operator",
      `Transition ${transitionId} uses triggered with non-trigger parameter ${condition.parameter}.`,
    ));
    return;
  }
  const numericOperator = condition.operator === "greater" || condition.operator === "greaterOrEqual"
    || condition.operator === "less" || condition.operator === "lessOrEqual";
  const expectsNumber = parameter.type === "float" || parameter.type === "int";
  const validValue = expectsNumber
    ? typeof condition.value === "number" && Number.isFinite(condition.value)
      && (parameter.type !== "int" || Number.isInteger(condition.value))
    : typeof condition.value === "boolean";
  if (!validValue || (numericOperator && !expectsNumber)) diagnostics.push(error(
    "invalid-condition-value",
    `Transition ${transitionId} has an incompatible condition for parameter ${condition.parameter}.`,
  ));
}

function validMotionTiming(durationSeconds: number, timeScale: number): boolean {
  return Number.isFinite(durationSeconds) && durationSeconds > 0
    && Number.isFinite(timeScale) && timeScale !== 0;
}

function error(code: string, message: string): CharacterRuntimeDiagnostic {
  return { code, severity: "error", message };
}
