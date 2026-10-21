import { collectAnimationEvents } from "./animation-events";
import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import type {
  FiredAnimatorStateEvent,
  RuntimeAnimatorStateDefinition,
} from "./animator-runtime";

export const MAX_AUTHORED_STATE_EVENTS_PER_STATE = ANIMATOR_DOCUMENT_LIMITS.stateEventsPerState;

export type AnimatorStateEventCollection = Readonly<{
  fired: readonly FiredAnimatorStateEvent[];
  truncated: boolean;
}>;

/** Collects authored state markers on the state timeline with bounded delivery. */
export function collectAnimatorStateEvents(
  layerId: string,
  state: RuntimeAnimatorStateDefinition,
  previousTimeSeconds: number,
  currentTimeSeconds: number,
  capacity: number,
): AnimatorStateEventCollection {
  const authored = state.events ?? [];
  if (authored.length === 0 || previousTimeSeconds === currentTimeSeconds) {
    return { fired: [], truncated: false };
  }
  const safeCapacity = Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : 0;
  const collected = collectAnimationEvents(
    authored.map((event) => ({
      id: event.id,
      name: event.name,
      timeSeconds: event.timeNormalized * state.durationSeconds,
      payload: event.payload,
    })),
    previousTimeSeconds,
    currentTimeSeconds,
    {
      durationSeconds: state.durationSeconds,
      looping: state.loop,
      maxEvents: Math.max(1, safeCapacity),
    },
  );
  const fired = safeCapacity === 0 ? [] : collected.fired.slice(0, safeCapacity).flatMap((item) => {
    const event = authored.find((candidate) => candidate.id === item.event.id);
    return event ? [{
      layerId,
      stateId: state.id,
      eventId: event.id,
      name: event.name,
      payload: event.payload,
      occurrenceTimeSeconds: item.occurrenceTimeSeconds,
    }] : [];
  });
  return {
    fired,
    truncated: collected.truncated || collected.fired.length > safeCapacity,
  };
}
