import { memo } from "react";
import type { ImportedCharacterAssetOption } from "../../application/imported-character-assets";
import type { AuthoredAvatarMask } from "../../domain/character-asset-library";
import type { AnimatorController, AnimatorLayer } from "../../domain/animator-controller";
import {
  animatorStateMachinePath,
  findAnimatorState,
} from "../../domain/animator-state-machine";
import type { AnimatorPreview } from "./useAnimatorPreview";
import type { AnimatorWorkspaceSelection } from "./animator-workspace-selection";
import { AnimatorClipSelectionInspector } from "./AnimatorClipSelectionInspector";
import { AnimatorLayerInspector } from "./AnimatorLayerInspector";
import { AnimatorParameterInspector } from "./AnimatorParameterInspector";
import { AnimatorStateInspector } from "./AnimatorStateInspector";
import { AnimatorStateMachineInspector } from "./AnimatorStateMachineInspector";
import { AnimatorTransitionInspector } from "./AnimatorTransitionInspector";

type AnimatorContextInspectorProps = Readonly<{
  controller: AnimatorController;
  layer: AnimatorLayer;
  selection: AnimatorWorkspaceSelection;
  masks: readonly AuthoredAvatarMask[];
  clips: readonly ImportedCharacterAssetOption[];
  preview: AnimatorPreview;
  currentStateMachineId?: string;
  onOpenStateMachine: (stateMachineId?: string) => void;
  onSelect: (selection: AnimatorWorkspaceSelection) => void;
  onChange: (controller: AnimatorController) => void;
}>;

/** Routes a typed workspace selection to one reusable inspector component. */
export const AnimatorContextInspector = memo(function AnimatorContextInspector(props: AnimatorContextInspectorProps) {
  const { controller, layer, selection, onSelect, onChange } = props;
  const selectLayer = () => onSelect({ kind: "layer", layerId: layer.id });
  const selectCurrentScope = () => onSelect(props.currentStateMachineId
    ? { kind: "scope", layerId: layer.id, stateMachineId: props.currentStateMachineId }
    : { kind: "layer", layerId: layer.id });
  let inspector;
  switch (selection.kind) {
    case "state":
      inspector = <AnimatorStateInspector
        controller={controller}
        layer={layer}
        stateId={selection.stateId}
        selectedBlendChildId={selection.blendChildId}
        clips={props.clips}
        preview={props.preview}
        onChange={onChange}
        onDeleted={selectCurrentScope}
        onSelectTransition={(transitionId) => onSelect({
          kind: "transition",
          layerId: layer.id,
          source: { kind: "state", stateId: selection.stateId },
          transitionId,
        })}
      />;
      break;
    case "states":
      inspector = <AnimatorClipSelectionInspector layer={layer} stateIds={selection.stateIds} />;
      break;
    case "stateMachine":
    case "scope": {
      const path = animatorStateMachinePath(layer, selection.stateMachineId);
      const parentMachine = path[path.length - 2];
      inspector = <AnimatorStateMachineInspector
        controller={controller}
        layer={layer}
        stateMachineId={selection.stateMachineId}
        onChange={onChange}
        onDeleted={() => props.onOpenStateMachine(parentMachine?.id)}
        onOpen={() => props.onOpenStateMachine(selection.stateMachineId)}
        canDelete={selection.kind === "stateMachine" && !layer.syncedLayerId}
        canOpen={selection.kind === "stateMachine"}
        onSelectReaction={(transitionId) => onSelect({
          kind: "transition",
          layerId: layer.id,
          source: { kind: "anyState", stateMachineId: selection.stateMachineId },
          transitionId,
        })}
        onSelectExitRoute={(transitionId) => onSelect({
          kind: "transition",
          layerId: layer.id,
          source: { kind: "stateMachine", stateMachineId: selection.stateMachineId },
          transitionId,
        })}
      />;
      break;
    }
    case "transition":
      inspector = <AnimatorTransitionInspector
        controller={controller}
        layer={layer}
        source={selection.source}
        transitionId={selection.transitionId}
        clips={props.clips}
        playbackProgress={props.preview.transitions.find((item) => (
          item.layerId === layer.id && item.transitionId === selection.transitionId
        ))?.progress}
        onChange={onChange}
        onDeleted={selectCurrentScope}
      />;
      break;
    case "parameter":
      inspector = <AnimatorParameterInspector key={selection.parameterId} controller={controller} parameterId={selection.parameterId} preview={props.preview} onChange={onChange} onDeleted={selectLayer} />;
      break;
    case "layer":
      inspector = <AnimatorLayerInspector
        controller={controller}
        layer={layer}
        masks={props.masks}
        onChange={onChange}
        onDeleted={(layerId) => onSelect({ kind: "layer", layerId })}
        onSelectReaction={(transitionId) => onSelect({
          kind: "transition",
          layerId: layer.id,
          source: { kind: "anyState" },
          transitionId,
        })}
      />;
      break;
  }
  return <aside className="animator-workspace__inspector" aria-label="Animator context inspector">{inspector}</aside>;
}, sameInspectorProps);

function sameInspectorProps(
  previous: AnimatorContextInspectorProps,
  next: AnimatorContextInspectorProps,
): boolean {
  if (previous.controller !== next.controller
    || previous.layer !== next.layer
    || previous.selection !== next.selection
    || previous.masks !== next.masks
    || previous.clips !== next.clips
    || previous.currentStateMachineId !== next.currentStateMachineId
    || previous.onOpenStateMachine !== next.onOpenStateMachine
    || previous.onSelect !== next.onSelect
    || previous.onChange !== next.onChange) return false;
  const selection = next.selection;
  if (selection.kind === "transition") {
    return previous.preview.transitions === next.preview.transitions;
  }
  const usesLiveValues = selection.kind === "parameter"
    || (selection.kind === "state"
      && findAnimatorState(next.layer, selection.stateId)?.state.motion?.kind === "blendTree");
  if (!usesLiveValues) return true;
  return previous.preview.values === next.preview.values
    && previous.preview.running === next.preview.running
    && previous.preview.setParameter === next.preview.setParameter;
}
