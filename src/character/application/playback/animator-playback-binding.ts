import type { CharacterRuntimeDiagnostic } from "../../runtime/diagnostics";
import type {
  AnimatorRuntimeState,
  RuntimeAnimatorControllerDefinition,
} from "../../runtime/animator-runtime";
import type { AnimatorPlaybackCommandPort } from "./animator-playback-commands";
import type { AnimatorPlaybackEventPort } from "./animator-playback-event-port";
import type { AnimatorIkCommandPort } from "./animator-playback-ik";
import type { AnimatorRootMotionPort } from "./animator-root-motion-port";

/** Read-only live trace from the actual world-owned gameplay Animator. */
export type AnimatorPlaybackTracePort = Readonly<{
  state: (objectId: string) => AnimatorRuntimeState | null;
  controller: (objectId: string) => RuntimeAnimatorControllerDefinition | null;
  subscribe: (objectId: string, listener: () => void) => () => void;
}>;

/** Stable scripting surface published by a gameplay viewport. */
export type AnimatorPlaybackBinding = Readonly<{
  commands: AnimatorPlaybackCommandPort;
  events: AnimatorPlaybackEventPort;
  ik: AnimatorIkCommandPort;
  rootMotion: AnimatorRootMotionPort;
  trace: AnimatorPlaybackTracePort;
  diagnostics: () => readonly CharacterRuntimeDiagnostic[];
}>;
