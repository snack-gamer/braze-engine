import type { AnimationEventPayload } from "../domain/animation-clip";
import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import type {
  AnimatorController,
  AnimatorLayer,
  AnimatorState,
  AnimatorStateEvent,
  AnimatorStateMachine,
  AnimatorTransition,
} from "../domain/animator-controller";
import type { AnimatorCondition, AnimatorParameter } from "../domain/animator-parameters";
import {
  CharacterCodecError,
  acceptDocumentVersion,
  arrayWithinLimit,
  clampedNumber,
  documentRecord,
  finiteNumber,
  optionalString,
  parseAssetRef,
  preservedDocumentFields,
  record,
  requiredString,
  serializeAssetRef,
  uniqueIds,
} from "./character-codec-values";
import {
  assertAnimatorControllerDocumentBudget,
  assertPersistedAnimatorLayerTransitionBudget,
} from "./animator-controller-document-budget";
import { validateAnimatorLayerStateMachines } from "./animator-state-machine-validation";
import { decodeAnimatorMotion, encodeAnimatorMotion } from "./animator-motion-codec";
import { decodeAnimatorBehaviorMap, encodeAnimatorBehaviorMap } from "./animator-behavior-map-codec";

export const ANIMATOR_CONTROLLER_FORMAT = "braze/animator-controller-v1";

const ANIMATOR_CONTROLLER_FIELDS = [
  "version", "id", "name", "revision", "sourceRef", "source_ref", "parameters", "layers",
  "behaviorMap", "behavior_map",
] as const;

function decodeParameters(value: unknown): AnimatorParameter[] {
  const parameters = arrayWithinLimit(
    value,
    "parameters",
    ANIMATOR_DOCUMENT_LIMITS.parametersPerController,
  ).flatMap((item, index): AnimatorParameter[] => {
    const input = record(item);
    if (!input) return [];
    const id = optionalString(input.id) ?? `parameter-${index + 1}`;
    const name = optionalString(input.name) ?? id;
    if (input.kind === "float") return [{ id, name, kind: "float", defaultValue: finiteNumber(input.defaultValue ?? input.default_value, 0) }];
    if (input.kind === "integer") {
      return [{ id, name, kind: "integer", defaultValue: Math.round(finiteNumber(input.defaultValue ?? input.default_value, 0)) }];
    }
    if (input.kind === "boolean") return [{ id, name, kind: "boolean", defaultValue: input.defaultValue === true || input.default_value === true }];
    if (input.kind === "trigger") return [{ id, name, kind: "trigger", defaultValue: false }];
    return [];
  });
  uniqueIds(parameters, "parameters");
  return parameters;
}

function decodeConditions(value: unknown, path: string): AnimatorCondition[] {
  return arrayWithinLimit(
    value,
    path,
    ANIMATOR_DOCUMENT_LIMITS.conditionsPerTransition,
  ).flatMap((item): AnimatorCondition[] => {
    const input = record(item);
    const parameterId = optionalString(input?.parameterId ?? input?.parameter_id);
    if (!input || !parameterId) return [];
    if (input.mode === "if" || input.mode === "ifNot" || input.mode === "triggered") {
      return [{ parameterId, mode: input.mode }];
    }
    if (input.mode === "greater" || input.mode === "less" || input.mode === "equals" || input.mode === "notEqual") {
      return [{ parameterId, mode: input.mode, threshold: finiteNumber(input.threshold, 0) }];
    }
    return [];
  });
}

function decodeTransition(value: unknown, path: string): AnimatorTransition | null {
  const input = record(value);
  if (!input) return null;
  const rawDestination = record(input.destination);
  const legacyStateId = optionalString(input.destinationStateId ?? input.destination_state_id);
  const stateMachineId = optionalString(
    rawDestination?.stateMachineId ?? rawDestination?.state_machine_id,
  );
  const destination = rawDestination?.kind === "stateMachine" && stateMachineId
    ? { kind: "stateMachine" as const, stateMachineId }
    : rawDestination?.kind === "exit" || (!rawDestination && !legacyStateId)
      ? { kind: "exit" as const }
      : {
        kind: "state" as const,
        stateId: optionalString(rawDestination?.stateId ?? rawDestination?.state_id) ?? legacyStateId ?? "",
      };
  return {
    id: optionalString(input.id) ?? `transition:${path}`,
    destination,
    conditions: decodeConditions(input.conditions, `${path}.conditions`),
    hasExitTime: input.hasExitTime === true || input.has_exit_time === true,
    exitTimeNormalized: Math.max(0, finiteNumber(input.exitTimeNormalized ?? input.exit_time_normalized, 0.75)),
    durationMode: input.durationMode === "seconds" || input.duration_mode === "seconds" ? "seconds" : "normalized",
    duration: Math.max(0, finiteNumber(input.duration, 0.25)),
    offsetNormalized: Math.max(0, finiteNumber(input.offsetNormalized ?? input.offset_normalized, 0)),
    interruptionSource:
      input.interruptionSource === "source"
      || input.interruptionSource === "destination"
      || input.interruptionSource === "sourceThenDestination"
      || input.interruptionSource === "destinationThenSource"
        ? input.interruptionSource
        : "none",
    orderedInterruption: input.orderedInterruption !== false && input.ordered_interruption !== false,
    canTransitionToSelf: input.canTransitionToSelf === true || input.can_transition_to_self === true,
  };
}

function decodeTransitions(value: unknown, path: string): AnimatorTransition[] {
  const transitions = arrayWithinLimit(
    value,
    path,
    ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer,
  ).flatMap((item, index) => {
    const decoded = decodeTransition(item, `${path}[${index}]`);
    return decoded ? [decoded] : [];
  });
  uniqueIds(transitions, path);
  return transitions;
}

function eventPayload(value: unknown): AnimationEventPayload {
  const input = record(value) ?? {};
  return Object.fromEntries(Object.entries(input).filter((entry): entry is [string, string | number | boolean | null] => (
    entry[1] === null || typeof entry[1] === "string" || typeof entry[1] === "number" || typeof entry[1] === "boolean"
  )));
}

function decodeStateEvents(value: unknown, path: string): AnimatorStateEvent[] {
  const events = arrayWithinLimit(
    value,
    path,
    ANIMATOR_DOCUMENT_LIMITS.stateEventsPerState,
  ).flatMap((item, index): AnimatorStateEvent[] => {
    const input = record(item);
    const name = optionalString(input?.name);
    if (!input || !name) return [];
    return [{
      id: optionalString(input.id) ?? `event-${index + 1}`,
      name,
      timeNormalized: clampedNumber(input.timeNormalized ?? input.time_normalized, 0, 0, 1),
      payload: eventPayload(input.payload),
    }];
  });
  uniqueIds(events, "events");
  return events;
}

function decodeStates(value: unknown, layerPath: string): AnimatorState[] {
  const states = arrayWithinLimit(
    value,
    `${layerPath}.states`,
    ANIMATOR_DOCUMENT_LIMITS.statesPerLayer,
  ).flatMap((item, index): AnimatorState[] => {
    const input = record(item);
    if (!input) return [];
    const id = optionalString(input.id) ?? `state-${index + 1}`;
    return [{
      id,
      name: optionalString(input.name) ?? id,
      motion: decodeAnimatorMotion(input.motion, `${layerPath}.states[${index}].motion`),
      speed: finiteNumber(input.speed, 1),
      ...(optionalString(input.speedParameterId ?? input.speed_parameter_id)
        ? { speedParameterId: optionalString(input.speedParameterId ?? input.speed_parameter_id)! }
        : {}),
      cycleOffset: finiteNumber(input.cycleOffset ?? input.cycle_offset, 0),
      ...(optionalString(input.cycleOffsetParameterId ?? input.cycle_offset_parameter_id)
        ? { cycleOffsetParameterId: optionalString(input.cycleOffsetParameterId ?? input.cycle_offset_parameter_id)! }
        : {}),
      mirror: input.mirror === true,
      footIk: input.footIk === true || input.foot_ik === true,
      writeDefaults: input.writeDefaults !== false && input.write_defaults !== false,
      transitions: decodeTransitions(input.transitions, `${layerPath}.states[${index}].transitions`),
      events: decodeStateEvents(input.events, `${layerPath}.states[${index}].events`),
    }];
  });
  uniqueIds(states, `${layerPath}.states`);
  return states;
}

function decodeStateMachines(
  value: unknown,
  path: string,
  depth: number,
  total: { count: number },
  active: WeakSet<object>,
): AnimatorStateMachine[] {
  if (depth > ANIMATOR_DOCUMENT_LIMITS.stateMachineDepth) throw new CharacterCodecError(
    "invalid-topology",
    path,
    `cannot exceed state-machine depth ${ANIMATOR_DOCUMENT_LIMITS.stateMachineDepth}`,
  );
  const machines = arrayWithinLimit(
    value,
    path,
    ANIMATOR_DOCUMENT_LIMITS.stateMachinesPerLayer,
  ).flatMap((item, index): AnimatorStateMachine[] => {
    const input = record(item);
    if (!input) return [];
    if (active.has(input)) throw new CharacterCodecError(
      "invalid-topology",
      `${path}[${index}]`,
      "state machines cannot contain a cycle",
    );
    active.add(input);
    total.count += 1;
    if (total.count > ANIMATOR_DOCUMENT_LIMITS.stateMachinesPerLayer) throw new CharacterCodecError(
      "invalid-document",
      path,
      `cannot exceed ${ANIMATOR_DOCUMENT_LIMITS.stateMachinesPerLayer} entries`,
    );
    const machinePath = `${path}[${index}]`;
    const id = optionalString(input.id) ?? `state-machine-${total.count}`;
    const states = decodeStates(input.states, machinePath);
    const stateMachines = decodeStateMachines(
      input.stateMachines ?? input.state_machines,
      `${machinePath}.stateMachines`,
      depth + 1,
      total,
      active,
    );
    const rawDefault = input.defaultStateId ?? input.default_state_id;
    const defaultStateId = typeof rawDefault === "string" && !rawDefault.trim()
      ? ""
      : optionalString(rawDefault) ?? states[0]?.id ?? stateMachines[0]?.id ?? "";
    const machine: AnimatorStateMachine = {
      id,
      name: optionalString(input.name) ?? id,
      defaultStateId,
      states,
      stateMachines,
      anyStateTransitions: decodeTransitions(
        input.anyStateTransitions ?? input.any_state_transitions,
        `${machinePath}.anyStateTransitions`,
      ),
      transitions: decodeTransitions(input.transitions, `${machinePath}.transitions`),
    };
    active.delete(input);
    return [machine];
  });
  uniqueIds(machines, path);
  return machines;
}

function decodeLayers(value: unknown): AnimatorLayer[] {
  const layers = arrayWithinLimit(
    value,
    "layers",
    ANIMATOR_DOCUMENT_LIMITS.layersPerController,
  ).flatMap((item, index): AnimatorLayer[] => {
    const input = record(item);
    if (!input) return [];
    const id = optionalString(input.id) ?? `layer-${index + 1}`;
    const path = `layers[${index}]`;
    assertPersistedAnimatorLayerTransitionBudget(input, path);
    const states = decodeStates(input.states, path);
    const stateMachines = decodeStateMachines(
      input.stateMachines ?? input.state_machines,
      `${path}.stateMachines`,
      1,
      { count: 0 },
      new WeakSet<object>(),
    );
    const rawDefaultState = input.defaultStateId ?? input.default_state_id;
    // A missing legacy field adopts the first state. An explicit empty value
    // means the author intentionally left Entry unwired.
    const defaultState = typeof rawDefaultState === "string" && !rawDefaultState.trim()
      ? ""
      : optionalString(rawDefaultState) ?? states[0]?.id ?? stateMachines[0]?.id ?? "";
    const avatarMaskRef = parseAssetRef(input.avatarMaskRef ?? input.avatar_mask_ref, `${path}.avatarMaskRef`);
    return [{
      id,
      name: optionalString(input.name) ?? id,
      weight: clampedNumber(input.weight, index === 0 ? 1 : 0, 0, 1),
      blendingMode: input.blendingMode === "additive" || input.blending_mode === "additive" ? "additive" : "override",
      ...(avatarMaskRef ? { avatarMaskRef } : {}),
      ikPass: input.ikPass === true || input.ik_pass === true,
      ...(optionalString(input.syncedLayerId ?? input.synced_layer_id)
        ? { syncedLayerId: optionalString(input.syncedLayerId ?? input.synced_layer_id)! }
        : {}),
      ...(input.syncedLayerAffectsTiming === true || input.synced_layer_affects_timing === true
        ? { syncedLayerAffectsTiming: true }
        : {}),
      defaultStateId: defaultState,
      states,
      anyStateTransitions: decodeTransitions(input.anyStateTransitions ?? input.any_state_transitions, `${path}.anyStateTransitions`),
      ...(stateMachines.length > 0 ? { stateMachines } : {}),
    }];
  });
  uniqueIds(layers, "layers");
  return layers;
}

function validateController(controller: AnimatorController): void {
  assertAnimatorControllerDocumentBudget(controller);
  if (controller.behaviorMap) decodeAnimatorBehaviorMap(
    encodeAnimatorBehaviorMap(controller.behaviorMap),
    { layers: controller.layers },
  );
  const parameterIds = new Set(controller.parameters.map((parameter) => parameter.id));
  const layerIds = new Set(controller.layers.map((layer) => layer.id));
  for (const layer of controller.layers) {
    validateAnimatorLayerStateMachines(layer, parameterIds);
    if (layer.syncedLayerId && (!layerIds.has(layer.syncedLayerId) || layer.syncedLayerId === layer.id)) {
      throw new CharacterCodecError("invalid-reference", `layers.${layer.id}.syncedLayerId`, "unknown or self-referencing layer");
    }
  }
}

export function decodeAnimatorController(value: unknown): AnimatorController {
  const input = documentRecord(value, "animatorController");
  acceptDocumentVersion(input, ANIMATOR_CONTROLLER_FORMAT, ["braze/animator-controller-v0"]);
  const sourceRef = parseAssetRef(input.sourceRef ?? input.source_ref, "sourceRef");
  const extensions = preservedDocumentFields(input, ANIMATOR_CONTROLLER_FIELDS);
  const parameters = decodeParameters(input.parameters);
  const layers = decodeLayers(input.layers);
  const behaviorMap = decodeAnimatorBehaviorMap(input.behaviorMap ?? input.behavior_map, {
    layers,
  });
  const controller: AnimatorController = {
    version: 1,
    id: requiredString(input.id, "id"),
    name: requiredString(input.name, "name"),
    ...(optionalString(input.revision) ? { revision: optionalString(input.revision)! } : {}),
    ...(sourceRef ? { sourceRef } : {}),
    parameters,
    layers,
    ...(behaviorMap ? { behaviorMap } : {}),
    ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
  };
  validateController(controller);
  return controller;
}

function encodeTransition(transition: AnimatorTransition) {
  return {
    id: transition.id,
    destination: { ...transition.destination },
    conditions: transition.conditions.map((condition) => ({ ...condition })),
    hasExitTime: transition.hasExitTime,
    exitTimeNormalized: transition.exitTimeNormalized,
    durationMode: transition.durationMode,
    duration: transition.duration,
    offsetNormalized: transition.offsetNormalized,
    interruptionSource: transition.interruptionSource,
    orderedInterruption: transition.orderedInterruption,
    canTransitionToSelf: transition.canTransitionToSelf,
  };
}

function encodeState(state: AnimatorState) {
  return {
    ...state,
    motion: state.motion ? encodeAnimatorMotion(state.motion) : null,
    transitions: state.transitions.map(encodeTransition),
    events: state.events.map((event) => ({ ...event, payload: { ...event.payload } })),
  };
}

function encodeStateMachine(machine: AnimatorStateMachine): Record<string, unknown> {
  return {
    id: machine.id,
    name: machine.name,
    defaultStateId: machine.defaultStateId,
    states: machine.states.map(encodeState),
    stateMachines: machine.stateMachines.map(encodeStateMachine),
    anyStateTransitions: machine.anyStateTransitions.map(encodeTransition),
    transitions: machine.transitions.map(encodeTransition),
  };
}

export function encodeAnimatorController(value: AnimatorController) {
  validateController(value);
  return {
    ...(value.extensions ?? {}),
    version: ANIMATOR_CONTROLLER_FORMAT,
    id: value.id,
    name: value.name,
    ...(value.revision ? { revision: value.revision } : {}),
    ...(value.sourceRef ? { sourceRef: serializeAssetRef(value.sourceRef) } : {}),
    parameters: value.parameters.map((parameter) => ({ ...parameter })),
    ...(value.behaviorMap ? { behaviorMap: encodeAnimatorBehaviorMap(value.behaviorMap) } : {}),
    layers: value.layers.map((layer) => {
      const { stateMachines, ...fields } = layer;
      return {
        ...fields,
        ...(layer.avatarMaskRef ? { avatarMaskRef: serializeAssetRef(layer.avatarMaskRef) } : {}),
        states: layer.states.map(encodeState),
        anyStateTransitions: layer.anyStateTransitions.map(encodeTransition),
        ...(stateMachines && stateMachines.length > 0
          ? { stateMachines: stateMachines.map(encodeStateMachine) }
          : {}),
      };
    }),
  };
}
