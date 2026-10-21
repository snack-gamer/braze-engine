import type {
  AnimatorBehaviorMap,
  AnimatorLayerBehaviorMap,
} from "../domain/animator-behavior-map";
import {
  ANIMATOR_GRAPH_NODE_IDS,
  animatorStateMachineNodeId,
  animatorStateNodeId,
} from "../domain/animator-behavior-map";
import type { AnimatorLayer } from "../domain/animator-controller";
import {
  animatorStateMachineScope,
  childAnimatorStateMachines,
} from "../domain/animator-state-machine";
import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import {
  CharacterCodecError,
  arrayWithinLimit,
  optionalString,
  parseVector2,
  record,
  uniqueIds,
} from "./character-codec-values";

type BehaviorMapReferences = Readonly<{
  layers: readonly AnimatorLayer[];
}>;

/**
 * Decodes graph layout only. Legacy `signals` and `groups` are deliberately
 * ignored: their Float parameters and blend-tree bindings already live in the
 * controller, while retaining the obsolete wrappers would preserve a second
 * authoring model.
 */
export function decodeAnimatorBehaviorMap(
  value: unknown,
  references: BehaviorMapReferences,
): AnimatorBehaviorMap | undefined {
  const input = record(value);
  if (!input) return undefined;
  if (input.version !== undefined && input.version !== 1) {
    throw new CharacterCodecError(
      "unsupported-version",
      "behaviorMap.version",
      `unsupported version ${String(input.version)}`,
    );
  }
  return { version: 1, layers: decodeLayerMaps(input.layers, references.layers) };
}

function decodeLayerMaps(
  value: unknown,
  layers: readonly AnimatorLayer[],
): AnimatorLayerBehaviorMap[] {
  const layerIds = new Set(layers.map((layer) => layer.id));
  const decoded = arrayWithinLimit(
    value,
    "behaviorMap.layers",
    ANIMATOR_DOCUMENT_LIMITS.layersPerController,
  ).flatMap((item): AnimatorLayerBehaviorMap[] => {
    const input = record(item);
    const layerId = optionalString(input?.layerId ?? input?.layer_id);
    if (!input || !layerId || !layerIds.has(layerId)) return [];
    const authoredLayer = layers.find((layer) => layer.id === layerId)!;
    const nodes = arrayWithinLimit(
      input.nodes,
      `behaviorMap.layers.${layerId}.nodes`,
      ANIMATOR_DOCUMENT_LIMITS.graphNodesPerLayer,
    ).flatMap((node): AnimatorLayerBehaviorMap["nodes"] => {
      const nodeInput = record(node);
      const id = optionalString(nodeInput?.id);
      if (!nodeInput || !id) return [];
      const stateMachineId = optionalString(
        nodeInput.stateMachineId ?? nodeInput.state_machine_id,
      );
      const scope = animatorStateMachineScope(authoredLayer, stateMachineId);
      if (!scope || !isLayoutNodeInScope(scope, id)) return [];
      return [{
        id,
        position: parseVector2(nodeInput.position),
        ...(stateMachineId ? { stateMachineId } : {}),
      }];
    });
    uniqueIds(nodes.map((node) => ({
      id: `${node.stateMachineId ?? "root"}:${node.id}`,
    })), `behaviorMap.layers.${layerId}.nodes`);
    return [{ layerId, nodes }];
  });
  uniqueIds(decoded.map((layer) => ({ id: layer.layerId })), "behaviorMap.layers");
  return decoded;
}

function isLayoutNodeInScope(
  scope: NonNullable<ReturnType<typeof animatorStateMachineScope>>,
  nodeId: string,
): boolean {
  return Object.values(ANIMATOR_GRAPH_NODE_IDS).includes(
    nodeId as typeof ANIMATOR_GRAPH_NODE_IDS[keyof typeof ANIMATOR_GRAPH_NODE_IDS],
  )
    || scope.states.some((state) => animatorStateNodeId(state.id) === nodeId)
    || childAnimatorStateMachines(scope).some((machine) => (
      animatorStateMachineNodeId(machine.id) === nodeId
    ));
}

export function encodeAnimatorBehaviorMap(value: AnimatorBehaviorMap) {
  return {
    version: 1,
    layers: value.layers.map((layer) => ({
      layerId: layer.layerId,
      nodes: layer.nodes.map((node) => ({
        id: node.id,
        position: [...node.position],
        ...(node.stateMachineId ? { stateMachineId: node.stateMachineId } : {}),
      })),
    })),
  };
}
