import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { ImportedCharacterAssetOption } from "../../application/imported-character-assets";
import type { AuthoredAvatarMask } from "../../domain/character-asset-library";
import type { AnimatorController } from "../../domain/animator-controller";
import { findAnimatorState } from "../../domain/animator-state-machine";
import type { AnimatorPlaybackBinding } from "../../application/playback/animator-playback-binding";
import type { ScenePlaybackMode } from "../../../types";
import { AnimatorContextInspector } from "./AnimatorContextInspector";
import { AnimatorGraphCanvas } from "./AnimatorGraphCanvas";
import { AnimatorNavigationRail } from "./AnimatorNavigationRail";
import { AnimatorWorkspaceToolbar } from "./AnimatorWorkspaceToolbar";
import {
  initialAnimatorWorkspaceSelection,
  reconcileAnimatorWorkspaceSelection,
  selectedAnimatorLayerId,
  type AnimatorWorkspaceSelection,
} from "./animator-workspace-selection";
import { useAnimatorPreview } from "./useAnimatorPreview";
import { useAnimatorInspectorResize } from "./useAnimatorInspectorResize";
import { useAnimatorWorkspaceKeyboardCommands } from "./useAnimatorWorkspaceKeyboardCommands";
import { useAnimatorStateMachineNavigation } from "./useAnimatorStateMachineNavigation";
import { useAnimatorConsoleDiagnostics } from "./useAnimatorConsoleDiagnostics";
import "./AnimatorWorkspace.css";

type AnimatorWorkspaceProps = Readonly<{
  controller: AnimatorController;
  masks: readonly AuthoredAvatarMask[];
  clips: readonly ImportedCharacterAssetOption[];
  objectId: string;
  playbackMode: ScenePlaybackMode;
  playbackBinding: AnimatorPlaybackBinding | null;
  active?: boolean;
  onChange: (controller: AnimatorController) => void;
}>;

export function AnimatorWorkspace({
  controller,
  masks,
  clips,
  objectId,
  playbackMode,
  playbackBinding,
  active = true,
  onChange,
}: AnimatorWorkspaceProps) {
  const [selection, setSelection] = useState<AnimatorWorkspaceSelection>(() => initialAnimatorWorkspaceSelection(controller));
  const inspectorResize = useAnimatorInspectorResize();
  const preview = useAnimatorPreview({
    controller,
    objectId,
    playbackMode,
    binding: playbackBinding,
    active,
  });
  useAnimatorConsoleDiagnostics(controller, preview.diagnostics);
  useEffect(() => setSelection((current) => reconcileAnimatorWorkspaceSelection(controller, current)), [controller]);
  const layerId = selectedAnimatorLayerId(selection);
  const layer = controller.layers.find((candidate) => candidate.id === layerId) ?? controller.layers[0];
  const blendTreeState = layer && selection.kind === "state" && selection.isolated
    ? findAnimatorState(layer, selection.stateId)?.state
    : undefined;
  const stateMachineNavigation = useAnimatorStateMachineNavigation(controller, layer?.id ?? "");
  useEffect(() => {
    if (!layer || selection.kind !== "state" || selection.layerId !== layer.id) return;
    stateMachineNavigation.open(findAnimatorState(layer, selection.stateId)?.ownerMachineId);
  }, [layer, selection, stateMachineNavigation.open]);
  const navigateStateMachine = useCallback((stateMachineId?: string) => {
    stateMachineNavigation.open(stateMachineId);
    if (!layer) return;
    setSelection(stateMachineId
      ? { kind: "scope", layerId: layer.id, stateMachineId }
      : { kind: "layer", layerId: layer.id });
  }, [layer, stateMachineNavigation.open]);
  const openBlendTree = (stateId: string) => {
    if (!layer) return;
    setSelection({ kind: "state", layerId: layer.id, stateId, isolated: true });
  };
  useAnimatorWorkspaceKeyboardCommands({
    active,
    controller,
    selection,
    onChange,
    onSelect: setSelection,
    onOpenStateMachine: navigateStateMachine,
  });
  if (!layer) return <div className="animator-workspace animator-workspace--empty">This controller has no layers.</div>;
  return (
    <div className="animator-workspace">
      <AnimatorWorkspaceToolbar
        controller={controller}
        layer={layer}
        stateMachinePath={stateMachineNavigation.path}
        blendTreeName={blendTreeState?.motion?.kind === "blendTree" ? blendTreeState.name : undefined}
        onChange={onChange}
        onNavigateStateMachine={navigateStateMachine}
      />
      <div
        ref={inspectorResize.bodyRef}
        className="animator-workspace__body"
        data-resizing-inspector={inspectorResize.resizing || undefined}
        data-isolated-blend-tree={blendTreeState?.motion?.kind === "blendTree" || undefined}
        style={{ "--animator-inspector-width": `${inspectorResize.width}px` } as CSSProperties}
      >
        <AnimatorNavigationRail controller={controller} layer={layer} selection={selection} preview={preview} onSelect={setSelection} onChange={onChange} />
        <AnimatorGraphCanvas
          controller={controller}
          layer={layer}
          stateMachineId={stateMachineNavigation.stateMachineId}
          clips={clips}
          selection={selection}
          preview={preview}
          onSelect={setSelection}
          onChange={onChange}
          onOpenStateMachine={navigateStateMachine}
          onOpenBlendTree={openBlendTree}
          blendTreeState={blendTreeState}
        />
        <div
          className="animator-workspace__inspector-resizer"
          role="separator"
          aria-label="Resize Animator Inspector"
          aria-orientation="vertical"
          aria-valuemin={inspectorResize.minimum}
          aria-valuemax={Math.round(inspectorResize.maximum)}
          aria-valuenow={Math.round(inspectorResize.width)}
          tabIndex={0}
          onPointerDown={inspectorResize.beginResize}
          onKeyDown={inspectorResize.resizeWithKeyboard}
        />
        <AnimatorContextInspector
          controller={controller}
          layer={layer}
          currentStateMachineId={stateMachineNavigation.stateMachineId}
          selection={selection}
          masks={masks}
          clips={clips}
          preview={preview}
          onSelect={setSelection}
          onChange={onChange}
          onOpenStateMachine={navigateStateMachine}
        />
      </div>
    </div>
  );
}
