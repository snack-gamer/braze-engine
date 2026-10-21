import { useCallback, useState, type DragEvent as ReactDragEvent } from "react";
import { addAnimatorClipStateAtPosition } from "../../application/animator-clip-drop-authoring";
import { ANIMATOR_GRAPH_NODE_SIZE } from "../../application/animator-graph-model";
import { canAddAnimatorState } from "../../application/animator-controller-authoring-limits";
import type { AnimatorController, AnimatorLayer } from "../../domain/animator-controller";
import {
  hasAnimationClipDrag,
  readAnimationClipDrag,
} from "../animation-clip-drag-data";
import type { AnimatorWorkspaceSelection } from "./animator-workspace-selection";
import {
  animatorGraphClientPointToWorld,
  type AnimatorGraphViewport,
} from "./animator-graph-viewport";

type AnimatorClipDropInput = Readonly<{
  controller: AnimatorController;
  layer: AnimatorLayer;
  stateMachineId?: string;
  view: AnimatorGraphViewport;
  onChange: (controller: AnimatorController) => void;
  onSelect: (selection: AnimatorWorkspaceSelection) => void;
}>;

/** Owns the Project Clip-to-graph HTML drag boundary. */
export function useAnimatorClipDrop(input: AnimatorClipDropInput) {
  const [active, setActive] = useState(false);
  const eligible = !input.layer.syncedLayerId
    && canAddAnimatorState(input.layer, input.stateMachineId);

  const onDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!eligible || !hasAnimationClipDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setActive(true);
  }, [eligible]);

  const onDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (!next || !event.currentTarget.contains(next)) setActive(false);
  }, []);

  const onDrop = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    setActive(false);
    if (!eligible) return;
    const clip = readAnimationClipDrag(event.dataTransfer);
    if (!clip) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = animatorGraphClientPointToWorld(
      input.view,
      { x: event.clientX, y: event.clientY },
      { x: bounds.left, y: bounds.top },
    );
    const result = addAnimatorClipStateAtPosition(input.controller, input.layer.id, {
      clipRef: clip.clipRef,
      name: clip.name,
      position: [
        point.x - ANIMATOR_GRAPH_NODE_SIZE.width / 2,
        point.y - ANIMATOR_GRAPH_NODE_SIZE.height / 2,
      ],
    }, input.stateMachineId);
    input.onChange(result.controller);
    input.onSelect({ kind: "state", layerId: input.layer.id, stateId: result.stateId });
  }, [eligible, input]);

  return { active, onDragOver, onDragLeave, onDrop };
}
