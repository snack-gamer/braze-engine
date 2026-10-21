import type {
  AnimatorLayerRuntimeState,
  AnimatorRuntimeState,
  RuntimeAnimatorControllerDefinition,
  RuntimeAnimatorStateDefinition,
} from "../../runtime/animator-runtime";
import type { AnimatorLayer } from "../../domain/animator-controller";
import {
  animatorStateMachinePath,
  findAnimatorState,
} from "../../domain/animator-state-machine";
import { resolveAnimatorMotionTime } from "../../runtime/animator-state-timing";

export type AnimatorPreviewPlayback = Readonly<{
  layerId: string;
  stateId: string;
  progress: number;
}>;

export type AnimatorPreviewTransitionPlayback = Readonly<{
  layerId: string;
  transitionId: string;
  progress: number;
}>;

export type AnimatorPreviewLayerFeedback = Readonly<{
  stateProgressById: ReadonlyMap<string, number>;
  activeStateMachineIds: ReadonlySet<string>;
  activeTransitionIds: ReadonlySet<string>;
  transitionProgressById: ReadonlyMap<string, number>;
}>;

/** Collects the layer-scoped lookup tables consumed by one graph canvas. */
export function animatorPreviewLayerFeedback(
  playback: readonly AnimatorPreviewPlayback[],
  transitions: readonly AnimatorPreviewTransitionPlayback[],
  layer: AnimatorLayer,
): AnimatorPreviewLayerFeedback {
  const layerPlayback = playback.filter((item) => item.layerId === layer.id);
  const layerTransitions = transitions.filter((item) => item.layerId === layer.id);
  return {
    stateProgressById: new Map(layerPlayback.map((item) => [item.stateId, item.progress])),
    activeStateMachineIds: animatorPreviewActiveStateMachineIdsForLayer(layerPlayback, layer),
    activeTransitionIds: new Set(layerTransitions.map((item) => item.transitionId)),
    transitionProgressById: new Map(layerTransitions.map((item) => [item.transitionId, item.progress])),
  };
}

/** Resolves the authored parent machines containing each active runtime leaf. */
export function animatorPreviewActiveStateMachineIdsForLayer(
  playback: readonly AnimatorPreviewPlayback[],
  layer: AnimatorLayer,
): ReadonlySet<string> {
  const activeMachineIds = new Set<string>();
  for (const item of playback) {
    if (item.layerId !== layer.id) continue;
    const ownerMachineId = findAnimatorState(layer, item.stateId)?.ownerMachineId;
    if (!ownerMachineId) continue;
    animatorStateMachinePath(layer, ownerMachineId).forEach((machine) => {
      activeMachineIds.add(machine.id);
    });
  }
  return activeMachineIds;
}

/** Resolves display-only Clip progress from the simulation's existing runtime sample. */
export function animatorPreviewPlayback(
  controller: RuntimeAnimatorControllerDefinition | null,
  runtime: AnimatorRuntimeState | null,
): readonly AnimatorPreviewPlayback[] {
  if (!controller || !runtime
    || controller.id !== runtime.controllerId
    || controller.revision !== runtime.controllerRevision) return [];
  return runtime.layers.flatMap((runtimeLayer) => {
    if (runtimeLayer.active === false) return [];
    const layer = controller.layers.find((candidate) => candidate.id === runtimeLayer.layerId);
    if (!layer) return [];
    const current = layer.states.find((state) => state.id === runtimeLayer.currentStateId);
    if (!current) return [];
    const output = [statePlayback(current, runtimeLayer.stateTimeSeconds, runtime)];
    const source = transitionSourcePlayback(layer.states, runtimeLayer, runtime);
    if (source && source.stateId !== current.id) output.push(source);
    return output.map((item) => ({ layerId: layer.id, ...item }));
  });
}

/** Resolves active transition progress from the same immutable gameplay sample. */
export function animatorPreviewTransitionPlayback(
  controller: RuntimeAnimatorControllerDefinition | null,
  runtime: AnimatorRuntimeState | null,
): readonly AnimatorPreviewTransitionPlayback[] {
  if (!matchingRuntime(controller, runtime)) return [];
  return runtime.layers.flatMap((layer) => {
    if (layer.active === false || !layer.transition) return [];
    const duration = Math.max(1.0e-6, layer.transition.durationSeconds);
    const progress = Math.min(1, Math.max(0, layer.transition.elapsedSeconds / duration));
    return authoredTransitionIds(layer.transition.id).map((transitionId) => ({
      layerId: layer.layerId,
      transitionId,
      progress,
    }));
  });
}

function transitionSourcePlayback(
  states: readonly RuntimeAnimatorStateDefinition[],
  layer: AnimatorLayerRuntimeState,
  runtime: AnimatorRuntimeState,
) {
  if (!layer.transition) return null;
  const source = states.find((state) => state.id === layer.transition?.fromStateId);
  return source ? statePlayback(source, layer.transition.fromStateTimeSeconds, runtime) : null;
}

function statePlayback(
  state: RuntimeAnimatorStateDefinition,
  stateTimeSeconds: number,
  runtime: AnimatorRuntimeState,
) {
  const motionTime = resolveAnimatorMotionTime(state, stateTimeSeconds, runtime.parameters);
  const normalized = (motionTime.value ?? stateTimeSeconds) / Math.max(1.0e-6, state.durationSeconds);
  return {
    stateId: state.id,
    progress: state.loop ? positiveModulo(normalized, 1) : Math.min(1, Math.max(0, normalized)),
  };
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function matchingRuntime(
  controller: RuntimeAnimatorControllerDefinition | null,
  runtime: AnimatorRuntimeState | null,
): runtime is AnimatorRuntimeState {
  return Boolean(controller && runtime
    && controller.id === runtime.controllerId
    && controller.revision === runtime.controllerRevision);
}

/**
 * Expanded transitions use `inner@leaf:exit-route:outer-route:index` runtime
 * IDs. Every authored segment participates in the same crossfade and therefore
 * receives the same editor playback telemetry.
 */
function authoredTransitionIds(runtimeId: string): readonly string[] {
  const separator = runtimeId.lastIndexOf("@");
  if (separator < 0) return [runtimeId];
  const authoredId = runtimeId.slice(0, separator);
  const expansion = runtimeId.slice(separator + 1).split(":");
  return expansion.length < 3
    ? [authoredId]
    : [authoredId, ...expansion.slice(1, -1)];
}
