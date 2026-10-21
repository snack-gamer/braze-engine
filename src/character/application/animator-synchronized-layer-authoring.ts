import {
  ANIMATOR_GRAPH_NODE_IDS,
  animatorStateMachineNodeId,
  animatorStateNodeId,
} from "../domain/animator-behavior-map";
import type {
  AnimatorController,
  AnimatorLayer,
  AnimatorState,
  AnimatorStateMachine,
} from "../domain/animator-controller";
import {
  animatorStateMachineScope,
  animatorStatesInLayer,
  childAnimatorStateMachines,
} from "../domain/animator-state-machine";
import { cloneAnimatorMotion } from "./animator-motion-authoring";

/** Rebuilds inherited state structure while retaining this layer's same-ID overrides. */
export function synchronizeAnimatorLayerStateMachine(
  layer: AnimatorLayer,
  source: AnimatorLayer,
): AnimatorLayer {
  const overrides = new Map(animatorStatesInLayer(layer).map((state) => [state.id, state]));
  return {
    ...layer,
    defaultStateId: source.defaultStateId,
    states: source.states.map((state) => synchronizedState(state, overrides.get(state.id))),
    ...(source.stateMachines ? {
      stateMachines: source.stateMachines.map((machine) => synchronizedMachine(machine, overrides)),
    } : { stateMachines: undefined }),
    anyStateTransitions: [],
  };
}

/** Reconciles every transitive layer that inherits from a changed source layer. */
export function reconcileAnimatorSynchronizedLayers(
  controller: AnimatorController,
  sourceLayerId: string,
): AnimatorController {
  const layersById = new Map(controller.layers.map((layer) => [layer.id, layer]));
  if (!layersById.has(sourceLayerId)) return controller;
  const dependentsBySource = new Map<string, string[]>();
  for (const layer of controller.layers) {
    if (!layer.syncedLayerId) continue;
    const dependents = dependentsBySource.get(layer.syncedLayerId) ?? [];
    dependents.push(layer.id);
    dependentsBySource.set(layer.syncedLayerId, dependents);
  }
  const reconciled = new Set<string>();
  const pending = [sourceLayerId];
  while (pending.length > 0) {
    const currentId = pending.shift()!;
    const source = layersById.get(currentId);
    if (!source) continue;
    for (const dependentId of dependentsBySource.get(currentId) ?? []) {
      if (reconciled.has(dependentId)) continue;
      const dependent = layersById.get(dependentId);
      if (!dependent) continue;
      layersById.set(dependentId, synchronizeAnimatorLayerStateMachine(dependent, source));
      reconciled.add(dependentId);
      pending.push(dependentId);
    }
  }
  if (reconciled.size === 0) return controller;
  const next = {
    ...controller,
    layers: controller.layers.map((layer) => layersById.get(layer.id) ?? layer),
  };
  return pruneAnimatorLayerBehaviorStateReferences(next, reconciled);
}

/** Removes layout entries whose scoped semantic graph node no longer exists. */
export function pruneAnimatorLayerBehaviorStateReferences(
  controller: AnimatorController,
  layerIds: ReadonlySet<string>,
): AnimatorController {
  if (!controller.behaviorMap || layerIds.size === 0) return controller;
  const authoredLayers = new Map(controller.layers
    .filter((layer) => layerIds.has(layer.id))
    .map((layer) => [layer.id, layer]));
  return {
    ...controller,
    behaviorMap: {
      ...controller.behaviorMap,
      layers: controller.behaviorMap.layers.map((layer) => {
        const authoredLayer = authoredLayers.get(layer.layerId);
        if (!authoredLayer) return layer;
        return {
          ...layer,
          nodes: layer.nodes.filter((node) => {
            const scope = animatorStateMachineScope(authoredLayer, node.stateMachineId);
            if (!scope) return false;
            return Object.values(ANIMATOR_GRAPH_NODE_IDS).includes(
              node.id as typeof ANIMATOR_GRAPH_NODE_IDS[keyof typeof ANIMATOR_GRAPH_NODE_IDS],
            )
              || scope.states.some((state) => animatorStateNodeId(state.id) === node.id)
              || childAnimatorStateMachines(scope).some((machine) => (
                animatorStateMachineNodeId(machine.id) === node.id
              ));
          }),
        };
      }),
    },
  };
}

function synchronizedState(source: AnimatorState, override: AnimatorState | undefined): AnimatorState {
  return {
    ...source,
    motion: override?.motion
      ? cloneMotion(override.motion)
      : cloneMotion(source.motion),
    mirror: override?.mirror ?? source.mirror,
    footIk: override?.footIk ?? source.footIk,
    writeDefaults: override?.writeDefaults ?? source.writeDefaults,
    transitions: [],
    events: [],
  };
}

function synchronizedMachine(
  source: AnimatorStateMachine,
  overrides: ReadonlyMap<string, AnimatorState>,
): AnimatorStateMachine {
  return {
    ...source,
    states: source.states.map((state) => synchronizedState(state, overrides.get(state.id))),
    stateMachines: source.stateMachines.map((machine) => synchronizedMachine(machine, overrides)),
    anyStateTransitions: [],
    transitions: [],
  };
}

function cloneMotion(motion: AnimatorState["motion"]): AnimatorState["motion"] {
  return motion ? cloneAnimatorMotion(motion) : null;
}
