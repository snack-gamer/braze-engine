import {
  characterRuntimeFailure,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import type { AnimatorPlaybackSession } from "./animator-playback-session";

type AnimatorParameterSession = Pick<AnimatorPlaybackSession<unknown>, "setParameter">;

export type AnimatorPlaybackCommandPort = Readonly<{
  setFloat: (objectId: string, parameter: string, value: number) => CharacterRuntimeResult<void>;
  setInt: (objectId: string, parameter: string, value: number) => CharacterRuntimeResult<void>;
  setBool: (objectId: string, parameter: string, value: boolean) => CharacterRuntimeResult<void>;
  setTrigger: (objectId: string, parameter: string) => CharacterRuntimeResult<void>;
  resetTrigger: (objectId: string, parameter: string) => CharacterRuntimeResult<void>;
}>;

/** Stable scripting-facing port; session ownership stays with the world coordinator. */
export function createAnimatorPlaybackCommandPort(
  sessionForObject: (objectId: string) => AnimatorParameterSession | undefined,
  onResult?: (objectId: string, result: CharacterRuntimeResult<void>) => void,
): AnimatorPlaybackCommandPort {
  const update = (
    objectId: string,
    parameter: string,
    value: number | boolean,
    expectedType: "float" | "int" | "bool" | "trigger",
  ): CharacterRuntimeResult<void> => {
    const session = sessionForObject(objectId);
    const result = session
      ? session.setParameter(parameter, value, expectedType)
      : characterRuntimeFailure({
          code: "missing-animator-session",
          severity: "warning",
          message: `Scene object ${objectId} has no active gameplay Animator session.`,
          path: objectId,
        });
    onResult?.(objectId, result);
    return result;
  };
  return {
    setFloat: (objectId, parameter, value) => update(objectId, parameter, value, "float"),
    setInt: (objectId, parameter, value) => update(objectId, parameter, value, "int"),
    setBool: (objectId, parameter, value) => update(objectId, parameter, value, "bool"),
    setTrigger: (objectId, parameter) => update(objectId, parameter, true, "trigger"),
    resetTrigger: (objectId, parameter) => update(objectId, parameter, false, "trigger"),
  };
}

/** Stable shell-facing proxy for a world whose Play session is replaceable. */
export function createAnimatorPlaybackCommandProxy(
  activePort: () => AnimatorPlaybackCommandPort | undefined,
): AnimatorPlaybackCommandPort {
  const invoke = <K extends keyof AnimatorPlaybackCommandPort>(
    command: K,
    ...args: Parameters<AnimatorPlaybackCommandPort[K]>
  ): CharacterRuntimeResult<void> => {
    const port = activePort();
    return port
      ? (port[command] as (...values: Parameters<AnimatorPlaybackCommandPort[K]>) => CharacterRuntimeResult<void>)(...args)
      : characterRuntimeFailure({
          code: "missing-animator-playback-coordinator",
          severity: "warning",
          message: "Animator commands require an active Play session.",
        });
  };
  return {
    setFloat: (...args) => invoke("setFloat", ...args),
    setInt: (...args) => invoke("setInt", ...args),
    setBool: (...args) => invoke("setBool", ...args),
    setTrigger: (...args) => invoke("setTrigger", ...args),
    resetTrigger: (...args) => invoke("resetTrigger", ...args),
  };
}
