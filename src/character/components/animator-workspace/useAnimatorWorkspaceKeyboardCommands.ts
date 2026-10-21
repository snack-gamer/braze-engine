import { useEffect, useRef } from "react";
import { removeScopedAnimatorState } from "../../application/animator-scoped-state-authoring";
import { removeAnimatorStateMachine } from "../../application/animator-state-machine-authoring";
import { removeAnimatorTransition } from "../../application/animator-transition-authoring";
import type { AnimatorController } from "../../domain/animator-controller";
import {
  animatorStateMachinePath,
  findAnimatorState,
} from "../../domain/animator-state-machine";
import {
  selectedAnimatorStateIds,
  type AnimatorWorkspaceSelection,
} from "./animator-workspace-selection";

type AnimatorWorkspaceKeyboardInput = Readonly<{
  active: boolean;
  controller: AnimatorController;
  selection: AnimatorWorkspaceSelection;
  onChange: (controller: AnimatorController) => void;
  onSelect: (selection: AnimatorWorkspaceSelection) => void;
  onOpenStateMachine: (stateMachineId?: string) => void;
}>;

/** Owns destructive keyboard commands after pointer or keyboard focus enters the workspace. */
export function useAnimatorWorkspaceKeyboardCommands(input: AnimatorWorkspaceKeyboardInput): void {
  const ownsKeyboardRef = useRef(false);

  useEffect(() => {
    if (!input.active) {
      ownsKeyboardRef.current = false;
      return undefined;
    }
    const updateOwnership = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      ownsKeyboardRef.current = Boolean(target?.closest(".animator-workspace"));
    };
    document.addEventListener("pointerdown", updateOwnership, true);
    document.addEventListener("focusin", updateOwnership, true);
    return () => {
      document.removeEventListener("pointerdown", updateOwnership, true);
      document.removeEventListener("focusin", updateOwnership, true);
    };
  }, [input.active]);

  useEffect(() => {
    if (!input.active) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!ownsKeyboardRef.current || receivesTextInput(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!canDeleteAnimatorWorkspaceSelection(input.controller, input.selection)) return;
      if (input.selection.kind === "transition") {
        const layer = input.controller.layers.find((candidate) => (
          candidate.id === input.selection.layerId
        ));
        const ownerMachineId = layer
          ? transitionOwnerMachineId(layer, input.selection.source)
          : undefined;
        input.onChange(removeAnimatorTransition(
          input.controller,
          input.selection.layerId,
          input.selection.source,
          input.selection.transitionId,
        ));
        input.onSelect(ownerMachineId
          ? { kind: "scope", layerId: input.selection.layerId, stateMachineId: ownerMachineId }
          : { kind: "layer", layerId: input.selection.layerId });
        return;
      }
      if (input.selection.kind === "stateMachine") {
        const layer = input.controller.layers.find((candidate) => (
          candidate.id === input.selection.layerId
        ));
        const path = layer
          ? animatorStateMachinePath(layer, input.selection.stateMachineId)
          : [];
        const parent = path[path.length - 2];
        input.onChange(removeAnimatorStateMachine(
          input.controller,
          input.selection.layerId,
          input.selection.stateMachineId,
        ));
        input.onOpenStateMachine(parent?.id);
        return;
      }
      const stateIds = selectedAnimatorStateIds(input.selection);
      if (stateIds.length === 0) return;
      const layer = input.controller.layers.find((candidate) => (
        candidate.id === input.selection.layerId
      ));
      const ownerIds = new Set(stateIds.map((stateId) => (
        layer ? findAnimatorState(layer, stateId)?.ownerMachineId : undefined
      )));
      const next = stateIds.reduce((current, stateId) => removeScopedAnimatorState(
        current,
        input.selection.layerId,
        stateId,
      ), input.controller);
      input.onChange(next);
      const ownerId = ownerIds.size === 1 ? [...ownerIds][0] : undefined;
      input.onSelect(ownerId
        ? { kind: "scope", layerId: input.selection.layerId, stateMachineId: ownerId }
        : { kind: "layer", layerId: input.selection.layerId });
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [input]);
}

/** Structural delete is unavailable for inherited synchronized-layer selections. */
export function canDeleteAnimatorWorkspaceSelection(
  controller: AnimatorController,
  selection: AnimatorWorkspaceSelection,
): boolean {
  const destructible = selection.kind === "transition"
    || selection.kind === "stateMachine"
    || selectedAnimatorStateIds(selection).length > 0;
  if (!destructible) return false;
  const layer = controller.layers.find((candidate) => candidate.id === selection.layerId);
  return Boolean(layer && !layer.syncedLayerId);
}

function transitionOwnerMachineId(
  layer: NonNullable<AnimatorController["layers"][number]>,
  source: Extract<AnimatorWorkspaceSelection, { kind: "transition" }>["source"],
): string | undefined {
  if (source.kind === "anyState") return source.stateMachineId;
  if (source.kind === "state") return findAnimatorState(layer, source.stateId)?.ownerMachineId;
  const path = animatorStateMachinePath(layer, source.stateMachineId);
  return path[path.length - 2]?.id;
}

function receivesTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
    || target.isContentEditable
    || Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}
