import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { ScenePlaybackMode } from "../../../types";
import type { AnimatorPlaybackBinding } from "../../application/playback/animator-playback-binding";
import { animatorPreviewParameters } from "../../application/playback/animator-preview-parameter-store";
import type { AnimatorController } from "../../domain/animator-controller";
import { compileAnimatorController } from "../../runtime/animator-controller-compiler";
import type {
  RuntimeAnimatorParameterValue,
} from "../../runtime/animator-runtime";
import type { CharacterRuntimeDiagnostic } from "../../runtime/diagnostics";
import {
  animatorPreviewPlayback,
  animatorPreviewTransitionPlayback,
  type AnimatorPreviewPlayback,
  type AnimatorPreviewTransitionPlayback,
} from "./animator-preview-playback";

export type AnimatorPreview = Readonly<{
  available: boolean;
  running: boolean;
  values: Readonly<Record<string, RuntimeAnimatorParameterValue>>;
  diagnostics: readonly CharacterRuntimeDiagnostic[];
  playback: readonly AnimatorPreviewPlayback[];
  transitions: readonly AnimatorPreviewTransitionPlayback[];
  setParameter: (parameterId: string, value: RuntimeAnimatorParameterValue) => void;
}>;

type AnimatorPreviewInput = Readonly<{
  controller: AnimatorController;
  objectId: string;
  playbackMode: ScenePlaybackMode;
  binding: AnimatorPlaybackBinding | null;
  active?: boolean;
}>;

/** Projects Behavior Map telemetry and editable parameter values from the viewport session. */
export function useAnimatorPreview({
  controller,
  objectId,
  playbackMode,
  binding,
  active = true,
}: AnimatorPreviewInput): AnimatorPreview {
  const previewTarget = `${objectId}\u0000${controller.id}`;
  const [previewValues, setPreviewValues] = useState(() => (
    animatorPreviewParameters.get(previewTarget) ?? {}
  ));
  const defaults = useMemo(() => parameterDefaults(controller), [controller.parameters]);
  const compiled = useMemo(() => compileAnimatorController(
    { ...controller, behaviorMap: undefined },
    () => ({ durationSeconds: 1, looping: true }),
  ), [controller.revision, controller.parameters, controller.layers]);
  const subscribe = useCallback((listener: () => void) => (
    active && binding ? binding.trace.subscribe(objectId, listener) : noSubscription
  ), [active, binding, objectId]);
  const getSnapshot = useCallback(() => (
    active ? binding?.trace.state(objectId) ?? null : null
  ), [active, binding, objectId]);
  const runtimeState = useSyncExternalStore(subscribe, getSnapshot, nullSnapshot);
  const runtimeController = runtimeState ? binding?.trace.controller(objectId) ?? null : null;
  const playback = useMemo(
    () => animatorPreviewPlayback(runtimeController, runtimeState),
    [runtimeController, runtimeState],
  );
  const transitions = useMemo(
    () => animatorPreviewTransitionPlayback(runtimeController, runtimeState),
    [runtimeController, runtimeState],
  );
  const setParameter = useCallback((parameterId: string, value: RuntimeAnimatorParameterValue) => {
    const parameter = controller.parameters.find((candidate) => candidate.id === parameterId);
    if (!parameter) return;
    const nextPreviewValues = {
      ...animatorPreviewParameters.get(previewTarget),
      [parameterId]: value,
    };
    animatorPreviewParameters.set(previewTarget, nextPreviewValues);
    setPreviewValues(nextPreviewValues);
    if (!binding) return;
    if (parameter.kind === "trigger") {
      if (value === true) binding.commands.setTrigger(objectId, parameterId);
      else binding.commands.resetTrigger(objectId, parameterId);
    } else if (parameter.kind === "boolean" && typeof value === "boolean") {
      binding.commands.setBool(objectId, parameterId, value);
    } else if (parameter.kind === "integer" && typeof value === "number") {
      binding.commands.setInt(objectId, parameterId, Math.round(value));
    } else if (parameter.kind === "float" && typeof value === "number") {
      binding.commands.setFloat(objectId, parameterId, value);
    }
  }, [binding, controller.parameters, objectId, previewTarget]);

  return {
    available: !!runtimeState,
    running: playbackMode === "playing" && !!runtimeState,
    values: runtimeState?.parameters ?? { ...defaults, ...previewValues },
    diagnostics: compiled.diagnostics,
    playback,
    transitions,
    setParameter,
  };
}

function parameterDefaults(controller: AnimatorController): Readonly<Record<string, RuntimeAnimatorParameterValue>> {
  return Object.fromEntries(controller.parameters.map((parameter) => [parameter.id, parameter.defaultValue]));
}

function noSubscription(): void {}

function nullSnapshot(): null {
  return null;
}
