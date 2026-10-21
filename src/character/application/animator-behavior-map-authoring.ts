import {
  ANIMATOR_GRAPH_NODE_IDS,
  animatorStateMachineNodeId,
  animatorStateNodeId,
  emptyAnimatorBehaviorMap,
  type AnimatorBehaviorMap,
  type AnimatorLayerBehaviorMap,
} from "../domain/animator-behavior-map";
import type { AnimatorController } from "../domain/animator-controller";
import type { CharacterVector2 } from "../domain/character-values";
import { animatorStateMachineScope, childAnimatorStateMachines } from "../domain/animator-state-machine";
import { AnimatorAuthoringError } from "./animator-controller-authoring";

export function animatorBehaviorMap(controller: AnimatorController): AnimatorBehaviorMap {
  return controller.behaviorMap ?? emptyAnimatorBehaviorMap();
}

export function animatorLayerBehaviorMap(
  controller: AnimatorController,
  layerId: string,
): AnimatorLayerBehaviorMap {
  return animatorBehaviorMap(controller).layers.find((layer) => layer.layerId === layerId)
    ?? { layerId, nodes: [] };
}

export function setAnimatorGraphNodePosition(
  controller: AnimatorController,
  layerId: string,
  nodeId: string,
  position: CharacterVector2,
  stateMachineId?: string,
): AnimatorController {
  const layer = assertLayer(controller, layerId);
  const scope = animatorStateMachineScope(layer, stateMachineId);
  if (!scope) throw new AnimatorAuthoringError(`Animator state machine '${stateMachineId}' was not found.`);
  const allowed = Object.values(ANIMATOR_GRAPH_NODE_IDS).includes(nodeId as typeof ANIMATOR_GRAPH_NODE_IDS[keyof typeof ANIMATOR_GRAPH_NODE_IDS])
    || scope.states.some((state) => animatorStateNodeId(state.id) === nodeId)
    || childAnimatorStateMachines(scope).some((machine) => (
      animatorStateMachineNodeId(machine.id) === nodeId
    ));
  if (!allowed) throw new AnimatorAuthoringError(`Animator graph node '${nodeId}' was not found.`);
  const finite: CharacterVector2 = [finiteCoordinate(position[0]), finiteCoordinate(position[1])];
  return updateLayerMap(controller, layerId, (map) => ({
    ...map,
    nodes: map.nodes.some((node) => (
      node.id === nodeId && node.stateMachineId === stateMachineId
    ))
      ? map.nodes.map((node) => (
          node.id === nodeId && node.stateMachineId === stateMachineId
            ? { ...node, position: finite }
            : node
        ))
      : [...map.nodes, {
          id: nodeId,
          position: finite,
          ...(stateMachineId ? { stateMachineId } : {}),
        }],
  }));
}

function updateLayerMap(
  controller: AnimatorController,
  layerId: string,
  update: (map: AnimatorLayerBehaviorMap) => AnimatorLayerBehaviorMap,
): AnimatorController {
  assertLayer(controller, layerId);
  const behaviorMap = animatorBehaviorMap(controller);
  const existing = behaviorMap.layers.find((layer) => layer.layerId === layerId)
    ?? { layerId, nodes: [] };
  const layers = behaviorMap.layers.some((layer) => layer.layerId === layerId)
    ? behaviorMap.layers.map((layer) => layer.layerId === layerId ? update(layer) : layer)
    : [...behaviorMap.layers, update(existing)];
  return { ...controller, behaviorMap: { ...behaviorMap, layers } };
}

function assertLayer(controller: AnimatorController, layerId: string) {
  const layer = controller.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new AnimatorAuthoringError(`Animator layer '${layerId}' was not found.`);
  return layer;
}

function finiteCoordinate(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
