import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import type { CharacterRuntimeDiagnostic } from "../../runtime/diagnostics";
import type { AnimatorPlaybackEvent } from "./animator-playback-contracts";

export type AnimatorPlaybackEventListener = (event: AnimatorPlaybackEvent) => void;

export type AnimatorPlaybackEventPort = Readonly<{
  subscribe: (
    listener: AnimatorPlaybackEventListener,
  ) => CharacterRuntimeResult<() => void>;
}>;

export type AnimatorPlaybackEventPublisher = Readonly<{
  port: AnimatorPlaybackEventPort;
  publish: (event: AnimatorPlaybackEvent) => void;
  dispose: () => void;
}>;

const DEFAULT_MAX_EVENT_LISTENERS = 32;

/** Bounded world-owned event fan-out; it owns no React or global state. */
export function createAnimatorPlaybackEventPublisher(
  maxListeners = DEFAULT_MAX_EVENT_LISTENERS,
  onListenerError?: (diagnostic: CharacterRuntimeDiagnostic) => void,
): AnimatorPlaybackEventPublisher {
  const listeners = new Set<AnimatorPlaybackEventListener>();
  const requestedCapacity = Number.isFinite(maxListeners)
    ? Math.floor(maxListeners)
    : DEFAULT_MAX_EVENT_LISTENERS;
  const capacity = Math.max(1, Math.min(DEFAULT_MAX_EVENT_LISTENERS, requestedCapacity));
  let disposed = false;
  return {
    port: {
      subscribe: (listener) => {
        if (disposed) return characterRuntimeFailure({
          code: "disposed-animator-event-port",
          severity: "warning",
          message: "Animator events cannot be subscribed after the world binding is disposed.",
        });
        if (listeners.size >= capacity) return characterRuntimeFailure(
          "animator-event-listener-capacity",
          `Animator playback supports at most ${capacity} event listeners per world.`,
        );
        listeners.add(listener);
        let subscribed = true;
        return characterRuntimeSuccess(() => {
          if (!subscribed) return;
          subscribed = false;
          listeners.delete(listener);
        });
      },
    },
    publish: (event) => {
      if (disposed) return;
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch (error) {
          onListenerError?.({
            code: "animator-event-listener-failed",
            severity: "warning",
            message: `An Animator event listener failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      listeners.clear();
    },
  };
}
