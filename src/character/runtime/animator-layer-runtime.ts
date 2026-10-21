import { collectAnimatorStateEvents } from "./animator-state-events";
import {
  resolveAnimatorStateTimeStep,
  type AnimatorMotionFrequencyResolver,
} from "./animator-state-timing";
import { runtimeAnimatorLayerIndex } from "./animator-runtime-index";
import type {
  AnimatorLayerRuntimeState,
  FiredAnimatorStateEvent,
  RuntimeAnimatorCondition,
  RuntimeAnimatorLayerDefinition,
  RuntimeAnimatorParameterValue,
  RuntimeAnimatorStateDefinition,
  RuntimeAnimatorTransitionDefinition,
} from "./animator-runtime";
import type { CharacterRuntimeDiagnostic } from "./diagnostics";

export type AnimatorLayerAdvanceResult = Readonly<{
  state: AnimatorLayerRuntimeState;
  firedTransitionId: string | null;
  consumedTriggers: readonly string[];
  firedStateEvents: readonly FiredAnimatorStateEvent[];
  eventsTruncated: boolean;
  diagnostics: readonly CharacterRuntimeDiagnostic[];
}>;

/** Advances one independent state machine, including bounded Unity-style interruption queues. */
export function advanceAnimatorLayer(
  layer: RuntimeAnimatorLayerDefinition,
  current: AnimatorLayerRuntimeState,
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>,
  deltaSeconds: number,
  eventCapacity: number,
  frequencyResolver?: AnimatorMotionFrequencyResolver,
): AnimatorLayerAdvanceResult {
  if (current.active === false) return unchanged(current);
  const states = runtimeAnimatorLayerIndex(layer).statesById;
  const activeState = states.get(current.currentStateId) ?? states.get(layer.initialStateId)!;
  if (current.transition) {
    return advanceTransition(
      layer, states, activeState, current, parameters, deltaSeconds, eventCapacity, frequencyResolver,
    );
  }
  return advanceState(layer, activeState, current, parameters, deltaSeconds, eventCapacity, frequencyResolver);
}

function advanceTransition(
  layer: RuntimeAnimatorLayerDefinition,
  states: ReadonlyMap<string, RuntimeAnimatorStateDefinition>,
  activeState: RuntimeAnimatorStateDefinition,
  current: AnimatorLayerRuntimeState,
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>,
  deltaSeconds: number,
  eventCapacity: number,
  frequencyResolver?: AnimatorMotionFrequencyResolver,
): AnimatorLayerAdvanceResult {
  const transition = current.transition!;
  const source = states.get(transition.fromStateId) ?? activeState;
  const sourceStep = resolveAnimatorStateTimeStep(source, parameters, deltaSeconds, frequencyResolver);
  const destination = transition.toStateId ? states.get(transition.toStateId) : undefined;
  const destinationStep = destination
    ? resolveAnimatorStateTimeStep(destination, parameters, deltaSeconds, frequencyResolver)
    : null;
  if (sourceStep.value === null || (destinationStep && destinationStep.value === null)) {
    return failed(current, [...sourceStep.diagnostics, ...(destinationStep?.diagnostics ?? [])]);
  }
  const nextSourceTime = transition.fromStateTimeSeconds + sourceStep.value;
  const nextDestinationTime = destination
    ? current.stateTimeSeconds + destinationStep!.value!
    : current.stateTimeSeconds;
  const sourceEvents = collectAnimatorStateEvents(
    layer.id,
    source,
    transition.fromStateTimeSeconds,
    nextSourceTime,
    eventCapacity,
  );
  const destinationEvents = destination ? collectAnimatorStateEvents(
    layer.id,
    destination,
    current.stateTimeSeconds,
    nextDestinationTime,
    Math.max(0, eventCapacity - sourceEvents.fired.length),
  ) : { fired: [], truncated: false };
  const nextTimes = new Map<string, number>([
    [source.id, nextSourceTime],
    ...(destination ? [[destination.id, nextDestinationTime] as const] : []),
  ]);
  const interrupting = chooseInterruption(layer, transition.id, source.id, destination?.id, nextTimes, parameters);
  const common = {
    firedStateEvents: [...sourceEvents.fired, ...destinationEvents.fired],
    eventsTruncated: sourceEvents.truncated || destinationEvents.truncated,
    diagnostics: [...sourceStep.diagnostics, ...(destinationStep?.diagnostics ?? [])],
  };
  if (interrupting) {
    const sourceTime = nextTimes.get(interrupting.sourceStateId) ?? nextDestinationTime;
    return {
      ...startTransition(current, states, interrupting, sourceTime),
      ...common,
    };
  }
  const elapsedSeconds = transition.elapsedSeconds + deltaSeconds;
  if (elapsedSeconds >= transition.durationSeconds) {
    return {
      state: transition.toStateId === null
        ? { ...current, stateTimeSeconds: nextSourceTime, transition: null, active: false }
        : { ...current, stateTimeSeconds: nextDestinationTime, transition: null, active: true },
      firedTransitionId: null,
      consumedTriggers: [],
      ...common,
    };
  }
  return {
    state: {
      ...current,
      stateTimeSeconds: nextDestinationTime,
      transition: { ...transition, elapsedSeconds, fromStateTimeSeconds: nextSourceTime },
      active: true,
    },
    firedTransitionId: null,
    consumedTriggers: [],
    ...common,
  };
}

function advanceState(
  layer: RuntimeAnimatorLayerDefinition,
  state: RuntimeAnimatorStateDefinition,
  current: AnimatorLayerRuntimeState,
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>,
  deltaSeconds: number,
  eventCapacity: number,
  frequencyResolver?: AnimatorMotionFrequencyResolver,
): AnimatorLayerAdvanceResult {
  const step = resolveAnimatorStateTimeStep(state, parameters, deltaSeconds, frequencyResolver);
  if (step.value === null) return failed(current, step.diagnostics);
  const previousTime = current.stateTimeSeconds;
  const nextTime = previousTime + step.value;
  const stateEvents = collectAnimatorStateEvents(layer.id, state, previousTime, nextTime, eventCapacity);
  const chosen = runtimeAnimatorLayerIndex(layer).candidatesForState(state.id).find((candidate) => (
    transitionEligible(candidate, state, previousTime, nextTime, parameters)
  ));
  if (!chosen) return {
    state: { ...current, currentStateId: state.id, stateTimeSeconds: nextTime, active: true },
    firedTransitionId: null,
    consumedTriggers: [],
    firedStateEvents: stateEvents.fired,
    eventsTruncated: stateEvents.truncated,
    diagnostics: step.diagnostics,
  };
  return {
    ...startTransition(current, runtimeAnimatorLayerIndex(layer).statesById, chosen, nextTime),
    firedStateEvents: stateEvents.fired,
    eventsTruncated: stateEvents.truncated,
    diagnostics: step.diagnostics,
  };
}

function chooseInterruption(
  layer: RuntimeAnimatorLayerDefinition,
  activeTransitionId: string,
  sourceStateId: string,
  destinationStateId: string | undefined,
  times: ReadonlyMap<string, number>,
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>,
): RuntimeAnimatorTransitionDefinition | null {
  const active = layer.transitions.find((transition) => transition.id === activeTransitionId);
  const source = active?.interruptionSource ?? "none";
  if (!active || source === "none") return null;
  const stateOrder = interruptionStateOrder(source, sourceStateId, destinationStateId);
  const candidates = interruptionQueue(layer.transitions, stateOrder);
  for (const candidate of candidates) {
    if (candidate.id === active.id) {
      if (active.orderedInterruption !== false) break;
      continue;
    }
    const candidateState = runtimeAnimatorLayerIndex(layer).statesById.get(candidate.sourceStateId);
    const time = times.get(candidate.sourceStateId);
    if (!candidateState || time === undefined) continue;
    if (transitionEligible(candidate, candidateState, time, time, parameters)) return candidate;
  }
  return null;
}

function interruptionStateOrder(
  source: NonNullable<RuntimeAnimatorTransitionDefinition["interruptionSource"]>,
  current: string,
  next: string | undefined,
): string[] {
  if (source === "source") return [current];
  if (source === "destination") return next ? [next] : [];
  if (source === "sourceThenDestination") return next ? [current, next] : [current];
  if (source === "destinationThenSource") return next ? [next, current] : [current];
  return [];
}

function interruptionQueue(
  transitions: readonly RuntimeAnimatorTransitionDefinition[],
  stateOrder: readonly string[],
): RuntimeAnimatorTransitionDefinition[] {
  const output: RuntimeAnimatorTransitionDefinition[] = [];
  const seen = new Set<string>();
  const append = (candidate: RuntimeAnimatorTransitionDefinition) => {
    if (seen.has(candidate.id)) return;
    seen.add(candidate.id);
    output.push(candidate);
  };
  for (const stateId of stateOrder) {
    transitions.filter((item) => item.fromAnyState && item.sourceStateId === stateId)
      .sort(compareAuthoringOrder).forEach(append);
  }
  for (const stateId of stateOrder) {
    transitions.filter((item) => !item.fromAnyState && item.sourceStateId === stateId)
      .sort(compareAuthoringOrder).forEach(append);
  }
  return output;
}

function compareAuthoringOrder(
  left: RuntimeAnimatorTransitionDefinition,
  right: RuntimeAnimatorTransitionDefinition,
): number {
  return (left.authoringOrder ?? 0) - (right.authoringOrder ?? 0) || left.id.localeCompare(right.id);
}

function startTransition(
  current: AnimatorLayerRuntimeState,
  states: ReadonlyMap<string, RuntimeAnimatorStateDefinition>,
  transition: RuntimeAnimatorTransitionDefinition,
  sourceTime: number,
): Pick<AnimatorLayerAdvanceResult, "state" | "firedTransitionId" | "consumedTriggers"> {
  const destination = transition.destinationStateId === null
    ? null
    : states.get(transition.destinationStateId)!;
  const destinationTime = destination
    ? (transition.destinationOffsetNormalized ?? 0) * destination.durationSeconds
    : sourceTime;
  const consumedTriggers = transition.conditions
    .filter((condition) => condition.operator === "triggered")
    .map((condition) => condition.parameter);
  const nextInstance = current.stateInstance + 1;
  if (transition.durationSeconds === 0) return {
    state: destination
      ? {
          ...current,
          currentStateId: destination.id,
          stateInstance: nextInstance,
          stateTimeSeconds: destinationTime,
          transition: null,
          active: true,
        }
      : { ...current, stateTimeSeconds: sourceTime, transition: null, active: false },
    firedTransitionId: transition.id,
    consumedTriggers,
  };
  return {
    state: {
      ...current,
      currentStateId: destination?.id ?? transition.sourceStateId,
      stateInstance: nextInstance,
      stateTimeSeconds: destinationTime,
      transition: {
        id: transition.id,
        fromStateId: transition.sourceStateId,
        fromStateInstance: current.stateInstance,
        fromStateTimeSeconds: sourceTime,
        toStateId: destination?.id ?? null,
        elapsedSeconds: 0,
        durationSeconds: transition.durationSeconds,
      },
      active: true,
    },
    firedTransitionId: transition.id,
    consumedTriggers,
  };
}

function transitionEligible(
  transition: RuntimeAnimatorTransitionDefinition,
  state: RuntimeAnimatorStateDefinition,
  previousTime: number,
  currentTime: number,
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>,
): boolean {
  if (transition.destinationStateId === state.id && !transition.allowSelfTransition) return false;
  return exitTimeReached(state, previousTime, currentTime, transition.exitTimeNormalized)
    && transition.conditions.every((condition) => conditionMatches(condition, parameters));
}

function exitTimeReached(
  state: RuntimeAnimatorStateDefinition,
  previousSeconds: number,
  currentSeconds: number,
  exitTime: number | undefined,
): boolean {
  if (exitTime === undefined) return true;
  const previous = previousSeconds / state.durationSeconds;
  const current = currentSeconds / state.durationSeconds;
  if (!state.loop || exitTime > 1) return current >= exitTime;
  const previousCycle = Math.floor(previous);
  const currentCycle = Math.floor(current);
  if (currentCycle === previousCycle) return current - currentCycle >= exitTime;
  if (currentCycle - previousCycle > 1) return true;
  return previous - previousCycle < exitTime || current - currentCycle >= exitTime;
}

function conditionMatches(
  condition: RuntimeAnimatorCondition,
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>,
): boolean {
  const actual = parameters[condition.parameter];
  if (condition.operator === "triggered") return actual === true;
  if (condition.operator === "equals") return actual === condition.value;
  if (condition.operator === "notEquals") return actual !== condition.value;
  if (typeof actual !== "number" || typeof condition.value !== "number") return false;
  if (condition.operator === "greater") return actual > condition.value;
  if (condition.operator === "greaterOrEqual") return actual >= condition.value;
  if (condition.operator === "less") return actual < condition.value;
  return actual <= condition.value;
}

function failed(
  state: AnimatorLayerRuntimeState,
  diagnostics: readonly CharacterRuntimeDiagnostic[],
): AnimatorLayerAdvanceResult {
  return { ...unchanged(state), diagnostics };
}

function unchanged(state: AnimatorLayerRuntimeState): AnimatorLayerAdvanceResult {
  return {
    state,
    firedTransitionId: null,
    consumedTriggers: [],
    firedStateEvents: [],
    eventsTruncated: false,
    diagnostics: [],
  };
}
