import type { RefObject } from "react";
import {
  addAnimatorBlendTreeStateWithDefaultParameters,
  canPrepareAnimatorBlendTreeKind,
} from "../../application/animator-blend-tree-state-authoring";
import { setAnimatorGraphNodePosition } from "../../application/animator-behavior-map-authoring";
import { canAddAnimatorState } from "../../application/animator-controller-authoring-limits";
import {
  ANIMATOR_GRAPH_NODE_SIZE,
} from "../../application/animator-graph-model";
import { addAnimatorStateMachine } from "../../application/animator-state-machine-authoring";
import {
  animatorStateMachineNodeId,
  animatorStateNodeId,
} from "../../domain/animator-behavior-map";
import type { AnimatorController, AnimatorLayer } from "../../domain/animator-controller";
import { ANIMATOR_DOCUMENT_LIMITS } from "../../domain/character-document-limits";
import {
  animatorStateMachineScope,
  animatorStateMachinesInLayer,
  childAnimatorStateMachines,
  findAnimatorStateMachine,
} from "../../domain/animator-state-machine";
import type { AnimatorWorkspaceSelection } from "./animator-workspace-selection";
import { AnimatorGraphContextMenu } from "./AnimatorGraphContextMenu";
import type { AnimatorGraphContextMenuLocation } from "./useAnimatorGraphContextMenu";

type AnimatorGraphCreateMenuProps = Readonly<{
  controller: AnimatorController;
  layer: AnimatorLayer;
  stateMachineId?: string;
  location: AnimatorGraphContextMenuLocation;
  menuRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onChange: (controller: AnimatorController) => void;
  onSelect: (selection: AnimatorWorkspaceSelection) => void;
}>;

/** Authors graph nodes at a blank-canvas context-menu location. */
export function AnimatorGraphCreateMenu({
  controller,
  layer,
  stateMachineId,
  location,
  menuRef,
  onClose,
  onChange,
  onSelect,
}: AnimatorGraphCreateMenuProps) {
  const canAddState = !layer.syncedLayerId && canAddAnimatorState(layer, stateMachineId);
  const atMachineDepthLimit = Boolean(stateMachineId
    && (findAnimatorStateMachine(layer, stateMachineId)?.depth ?? 0)
      >= ANIMATOR_DOCUMENT_LIMITS.stateMachineDepth);
  const stateDisabledReason = layer.syncedLayerId
    ? "Synchronized layers inherit their state machine."
    : "This layer reached its state or transition limit.";
  const createBlendTree = (dimensions: "1d" | "2d") => {
    const result = dimensions === "1d"
      ? addAnimatorBlendTreeStateWithDefaultParameters(controller, { layerId: layer.id, stateMachineId }, {
          kind: "1d",
          name: "New Blend Tree",
        })
      : addAnimatorBlendTreeStateWithDefaultParameters(controller, { layerId: layer.id, stateMachineId }, {
          kind: "2dFreeformCartesian",
          name: "New Blend Tree",
        });
    onChange(positionCreatedNode(
      result.controller,
      layer.id,
      animatorStateNodeId(result.stateId),
      location,
      stateMachineId,
    ));
    onSelect({ kind: "state", layerId: layer.id, stateId: result.stateId });
  };

  return <AnimatorGraphContextMenu
    ariaLabel="Create Animator node"
    screenPosition={location.screen}
    menuRef={menuRef}
    onClose={onClose}
    actions={[
      {
        id: "create-state-machine",
        label: "Create Nested State Machine",
        disabled: Boolean(layer.syncedLayerId)
          || atMachineDepthLimit
          || animatorStateMachinesInLayer(layer).length >= ANIMATOR_DOCUMENT_LIMITS.stateMachinesPerLayer,
        disabledReason: layer.syncedLayerId
          ? "Synchronized layers inherit their state machine."
          : atMachineDepthLimit
            ? `State machines cannot exceed depth ${ANIMATOR_DOCUMENT_LIMITS.stateMachineDepth}.`
            : "This layer reached its state-machine limit.",
        onSelect: () => {
          let next = addAnimatorStateMachine(
            controller,
            layer.id,
            stateMachineId,
            { name: "New State Machine" },
          );
          const nextLayer = next.layers.find((candidate) => candidate.id === layer.id)!;
          const nextScope = animatorStateMachineScope(nextLayer, stateMachineId)!;
          const machines = childAnimatorStateMachines(nextScope);
          const machine = machines[machines.length - 1]!;
          next = positionCreatedNode(
            next,
            layer.id,
            animatorStateMachineNodeId(machine.id),
            location,
            stateMachineId,
          );
          onChange(next);
          onSelect({ kind: "stateMachine", layerId: layer.id, stateMachineId: machine.id });
        },
      },
      {
        id: "create-blend-tree-1d",
        label: "Create 1D Blend Tree",
        disabled: !canAddState || !canPrepareAnimatorBlendTreeKind(controller, "1d"),
        disabledReason: !canAddState
          ? stateDisabledReason
          : "This controller has no room for a required Float parameter.",
        onSelect: () => createBlendTree("1d"),
      },
      {
        id: "create-blend-tree-2d",
        label: "Create 2D Blend Tree",
        disabled: !canAddState || !canPrepareAnimatorBlendTreeKind(controller, "2dFreeformCartesian"),
        disabledReason: !canAddState
          ? stateDisabledReason
          : "This controller has no room for the required Float parameters.",
        onSelect: () => createBlendTree("2d"),
      },
    ]}
  />;
}

function positionCreatedNode(
  controller: AnimatorController,
  layerId: string,
  nodeId: string,
  location: AnimatorGraphContextMenuLocation,
  stateMachineId?: string,
): AnimatorController {
  return setAnimatorGraphNodePosition(
    controller,
    layerId,
    nodeId,
    [
      location.world.x - ANIMATOR_GRAPH_NODE_SIZE.width / 2,
      location.world.y - ANIMATOR_GRAPH_NODE_SIZE.height / 2,
    ],
    stateMachineId,
  );
}
