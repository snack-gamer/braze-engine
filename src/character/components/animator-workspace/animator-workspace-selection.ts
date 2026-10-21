import type { AnimatorTransitionSource } from "../../application/animator-transition-authoring";
import type { AnimatorGraphNode } from "../../application/animator-graph-model";
import type { AnimatorController } from "../../domain/animator-controller";
import {
  animatorStatesInLayer,
  findAnimatorState,
  findAnimatorStateMachine,
} from "../../domain/animator-state-machine";
import { resolveAnimatorTransitionLayer } from "../../domain/animator-synchronized-layer";

export type AnimatorWorkspaceSelection =
  | Readonly<{ kind: "layer"; layerId: string }>
  | Readonly<{ kind: "state"; layerId: string; stateId: string; isolated?: boolean; blendChildId?: string }>
  | Readonly<{ kind: "states"; layerId: string; stateIds: readonly string[] }>
  | Readonly<{ kind: "scope"; layerId: string; stateMachineId: string }>
  | Readonly<{ kind: "stateMachine"; layerId: string; stateMachineId: string }>
  | Readonly<{ kind: "transition"; layerId: string; source: AnimatorTransitionSource; transitionId: string }>
  | Readonly<{ kind: "parameter"; layerId: string; parameterId: string }>;

export function initialAnimatorWorkspaceSelection(controller: AnimatorController): AnimatorWorkspaceSelection {
  return { kind: "layer", layerId: controller.layers[0]?.id ?? "" };
}

export function reconcileAnimatorWorkspaceSelection(
  controller: AnimatorController,
  selection: AnimatorWorkspaceSelection,
): AnimatorWorkspaceSelection {
  if (selection.kind === "parameter") {
    return controller.layers.some((layer) => layer.id === selection.layerId)
      && controller.parameters.some((parameter) => parameter.id === selection.parameterId)
      ? selection
      : initialAnimatorWorkspaceSelection(controller);
  }
  const layer = controller.layers.find((candidate) => candidate.id === selection.layerId);
  if (!layer) return initialAnimatorWorkspaceSelection(controller);
  if (selection.kind === "layer") return selection;
  if (selection.kind === "state") {
    return Boolean(findAnimatorState(layer, selection.stateId))
      ? selection
      : { kind: "layer", layerId: layer.id };
  }
  if (selection.kind === "states") {
    const available = new Set(animatorStatesInLayer(layer).map((state) => state.id));
    const stateIds = selection.stateIds.filter((stateId, index, values) => (
      available.has(stateId) && values.indexOf(stateId) === index
    ));
    if (stateIds.length === 0) return { kind: "layer", layerId: layer.id };
    if (stateIds.length === 1) return { kind: "state", layerId: layer.id, stateId: stateIds[0]! };
    return stateIds.length === selection.stateIds.length
      ? selection
      : { ...selection, stateIds };
  }
  if (selection.kind === "stateMachine" || selection.kind === "scope") {
    return findAnimatorStateMachine(layer, selection.stateMachineId)
      ? selection
      : { kind: "layer", layerId: layer.id };
  }
  const transitionLayer = resolveAnimatorTransitionLayer(controller, layer);
  const transitions = selection.source.kind === "state"
    ? findAnimatorState(transitionLayer, selection.source.stateId)?.state.transitions ?? []
    : selection.source.kind === "stateMachine"
      ? findAnimatorStateMachine(transitionLayer, selection.source.stateMachineId)?.machine.transitions ?? []
      : selection.source.stateMachineId
        ? findAnimatorStateMachine(transitionLayer, selection.source.stateMachineId)?.machine.anyStateTransitions ?? []
        : transitionLayer.anyStateTransitions;
  return transitions.some((transition) => transition.id === selection.transitionId)
    ? selection
    : { kind: "layer", layerId: layer.id };
}

export function selectedAnimatorLayerId(
  selection: AnimatorWorkspaceSelection,
): string {
  return selection.layerId;
}

export function selectedAnimatorStateIds(selection: AnimatorWorkspaceSelection): readonly string[] {
  if (selection.kind === "state" && !selection.blendChildId) return [selection.stateId];
  if (selection.kind === "states") return selection.stateIds;
  return [];
}

export function animatorSelectionForStateIds(
  layerId: string,
  stateIds: readonly string[],
  stateMachineId?: string,
): AnimatorWorkspaceSelection {
  if (stateIds.length === 0) return stateMachineId
    ? { kind: "scope", layerId, stateMachineId }
    : { kind: "layer", layerId };
  if (stateIds.length === 1) return { kind: "state", layerId, stateId: stateIds[0]! };
  return { kind: "states", layerId, stateIds };
}

export function animatorSelectionForGraphNode(
  layerId: string,
  node: AnimatorGraphNode,
  stateMachineId?: string,
): AnimatorWorkspaceSelection {
  if (node.stateId) return { kind: "state", layerId, stateId: node.stateId };
  if (node.stateMachineId) return { kind: "stateMachine", layerId, stateMachineId: node.stateMachineId };
  return stateMachineId
    ? { kind: "scope", layerId, stateMachineId }
    : { kind: "layer", layerId };
}
