import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnimatorController } from "../../domain/animator-controller";
import {
  animatorStateMachinePath,
  findAnimatorStateMachine,
} from "../../domain/animator-state-machine";

/** Owns disposable drill-in state for the currently selected Animator layer. */
export function useAnimatorStateMachineNavigation(
  controller: AnimatorController,
  layerId: string,
) {
  const [stateMachineId, setStateMachineId] = useState<string>();
  const layer = controller.layers.find((candidate) => candidate.id === layerId);

  useEffect(() => setStateMachineId(undefined), [layerId]);
  useEffect(() => {
    if (!stateMachineId || !layer) return;
    if (!findAnimatorStateMachine(layer, stateMachineId)) setStateMachineId(undefined);
  }, [layer, stateMachineId]);

  const resolvedStateMachineId = stateMachineId
    && layer
    && findAnimatorStateMachine(layer, stateMachineId)
    ? stateMachineId
    : undefined;

  const path = useMemo(
    () => layer ? animatorStateMachinePath(layer, resolvedStateMachineId) : [],
    [layer, resolvedStateMachineId],
  );
  const open = useCallback((nextStateMachineId?: string) => {
    setStateMachineId(nextStateMachineId);
  }, []);

  return { stateMachineId: resolvedStateMachineId, path, open };
}
