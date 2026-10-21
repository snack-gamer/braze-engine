import { useCallback, useEffect, useState, type RefObject } from "react";
import type { AnimatorGraphNode } from "../../application/animator-graph-model";
import { setAnimatorDefaultState } from "../../application/animator-controller-authoring";
import { setAnimatorStateMachineDefaultNode } from "../../application/animator-state-machine-authoring";
import {
  addAnimatorTransition,
  type AnimatorTransitionSource,
} from "../../application/animator-transition-authoring";
import type { AnimatorController, AnimatorLayer } from "../../domain/animator-controller";
import {
  animatorStateMachineScope,
  findAnimatorState,
  findAnimatorStateMachine,
} from "../../domain/animator-state-machine";
import {
  canBeginAnimatorGraphConnection,
  canCompleteAnimatorGraphConnection,
  sameAnimatorGraphConnectionSource,
  type AnimatorGraphConnectionPreview,
  type AnimatorGraphConnectionSource,
} from "./animator-graph-connection";
import { animatorGraphClientPointToWorld, type AnimatorGraphViewport } from "./animator-graph-viewport";
import type { AnimatorWorkspaceSelection } from "./animator-workspace-selection";

type AnimatorGraphConnectionsInput = Readonly<{
  controller: AnimatorController;
  layer: AnimatorLayer;
  stateMachineId?: string;
  nodes: readonly AnimatorGraphNode[];
  view: AnimatorGraphViewport;
  viewportRef: RefObject<HTMLDivElement | null>;
  onChange: (controller: AnimatorController) => void;
  onSelect: (selection: AnimatorWorkspaceSelection) => void;
}>;

/** Owns one pending graph wire from gesture start through preview, cancel, or commit. */
export function useAnimatorGraphConnections(input: AnimatorGraphConnectionsInput) {
  const [pendingSource, setPendingSource] = useState<AnimatorGraphConnectionSource | null>(null);
  const [preview, setPreview] = useState<AnimatorGraphConnectionPreview | null>(null);
  const cancel = useCallback(() => {
    setPendingSource(null);
    setPreview(null);
  }, []);
  const begin = useCallback((source: AnimatorGraphConnectionSource) => {
    setPendingSource(source);
    setPreview(null);
  }, []);

  useEffect(() => cancel(), [cancel, input.layer.id, input.stateMachineId]);
  useEffect(() => {
    if (pendingSource && !canBeginAnimatorGraphConnection(
      input.layer,
      pendingSource,
      input.stateMachineId,
    )) cancel();
  }, [cancel, input.layer, input.stateMachineId, pendingSource]);
  useEffect(() => {
    if (!pendingSource) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [cancel, pendingSource]);

  const complete = useCallback((
    source: AnimatorGraphConnectionSource,
    destinationNode: AnimatorGraphNode,
  ) => {
    if (!canCompleteAnimatorGraphConnection(
      input.controller, input.layer, source, destinationNode, input.stateMachineId,
    )) {
      cancel();
      return;
    }
    if (source.kind === "entry") {
      const destinationId = destinationNode.stateId ?? destinationNode.stateMachineId!;
      input.onChange(input.stateMachineId
        ? setAnimatorStateMachineDefaultNode(
            input.controller,
            input.layer.id,
            input.stateMachineId,
            destinationId,
          )
        : setAnimatorDefaultState(input.controller, input.layer.id, destinationId));
      cancel();
      input.onSelect(destinationNode.kind === "stateMachine"
        ? { kind: "stateMachine", layerId: input.layer.id, stateMachineId: destinationId }
        : { kind: "state", layerId: input.layer.id, stateId: destinationId });
      return;
    }
    const destination = destinationNode.kind === "exit"
      ? { kind: "exit" as const }
      : destinationNode.kind === "stateMachine"
        ? { kind: "stateMachine" as const, stateMachineId: destinationNode.stateMachineId! }
        : { kind: "state" as const, stateId: destinationNode.stateId! };
    const next = addAnimatorTransition(input.controller, input.layer.id, source, destination);
    const transitions = transitionsForSource(next, input.layer.id, source);
    const transition = transitions[transitions.length - 1];
    input.onChange(next);
    cancel();
    if (transition) input.onSelect({
      kind: "transition",
      layerId: input.layer.id,
      source,
      transitionId: transition.id,
    });
  }, [cancel, input]);

  const updatePreview = useCallback((
    source: AnimatorGraphConnectionSource,
    sourceNodeId: string,
    clientX: number,
    clientY: number,
    destinationNodeId: string | null,
  ) => {
    const bounds = input.viewportRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const destination = input.nodes.find((candidate) => candidate.id === destinationNodeId);
    const valid = Boolean(destination && canCompleteAnimatorGraphConnection(
      input.controller, input.layer, source, destination, input.stateMachineId,
    ));
    setPreview({
      sourceNodeId,
      pointer: animatorGraphClientPointToWorld(
        input.view,
        { x: clientX, y: clientY },
        { x: bounds.left, y: bounds.top },
      ),
      ...(destination ? { destinationNodeId: destination.id } : {}),
      status: destination ? valid ? "valid" : "invalid" : "free",
    });
  }, [input]);

  const drop = useCallback((
    source: AnimatorGraphConnectionSource,
    destinationNodeId: string | null,
  ) => {
    const destination = input.nodes.find((candidate) => candidate.id === destinationNodeId);
    if (pendingSource
      && sameAnimatorGraphConnectionSource(source, pendingSource)
      && destination) complete(source, destination);
    else cancel();
  }, [cancel, complete, input.nodes, pendingSource]);

  return { pendingSource, preview, begin, cancel, complete, updatePreview, drop };
}

function transitionsForSource(
  controller: AnimatorController,
  layerId: string,
  source: AnimatorTransitionSource,
) {
  const layer = controller.layers.find((candidate) => candidate.id === layerId);
  if (!layer) return [];
  if (source.kind === "anyState") {
    return source.stateMachineId
      ? animatorStateMachineScope(layer, source.stateMachineId)?.anyStateTransitions ?? []
      : layer.anyStateTransitions;
  }
  if (source.kind === "stateMachine") {
    return findAnimatorStateMachine(layer, source.stateMachineId)?.machine.transitions ?? [];
  }
  return findAnimatorState(layer, source.stateId)?.state.transitions ?? [];
}
