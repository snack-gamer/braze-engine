import type { GameEvent, GameEventPort } from "../domain/game-module";

export const GAME_EVENT_LIMITS = Object.freeze({ queued: 256, listeners: 64, deliveredPerTick: 128 });

function copyEvent(event: GameEvent): GameEvent {
  if (!event || typeof event.type !== "string" || !event.type || event.type.length > 128) throw new Error("Gameplay events require a type of 1-128 characters.");
  if (event.targetId !== undefined && (typeof event.targetId !== "string" || event.targetId.length > 256)) throw new Error("Invalid gameplay event target.");
  const entries = Object.entries(event.payload ?? {});
  if (entries.length > 32) throw new Error("Gameplay event payloads allow at most 32 entries.");
  for (const [key, value] of entries) {
    if (key.length > 128 || (value !== null && typeof value !== "boolean" && typeof value !== "string" && typeof value !== "number")
      || (typeof value === "number" && !Number.isFinite(value)) || (typeof value === "string" && value.length > 1024)) throw new Error("Invalid gameplay event payload.");
  }
  return Object.freeze({ type: event.type, targetId: event.targetId, payload: Object.freeze(Object.fromEntries(entries)) });
}

/** Queue delivery never recursively evaluates newly emitted events in the same tick. */
export function createGameEvents(onError: (error: unknown) => void) {
  let queue: GameEvent[] = [];
  const listeners = new Map<string, Set<(event: GameEvent) => void>>();
  let count = 0, disposed = false;
  const port: GameEventPort = {
    emit(event) {
      if (disposed) return;
      if (queue.length >= GAME_EVENT_LIMITS.queued) throw new Error("Gameplay event queue capacity exceeded.");
      queue.push(copyEvent(event));
    },
    subscribe(type, listener) {
      if (disposed) return () => undefined;
      if (typeof type !== "string" || !type || type.length > 128 || typeof listener !== "function") throw new Error("Invalid gameplay event subscription.");
      if (count >= GAME_EVENT_LIMITS.listeners) throw new Error("Gameplay event listener capacity exceeded.");
      // Each registration owns a distinct wrapper, even for the same callback.
      const callback = (event: GameEvent) => listener(event);
      const group = listeners.get(type) ?? new Set();
      group.add(callback); listeners.set(type, group); count += 1;
      return () => {
        if (!group.delete(callback)) return;
        count -= 1;
        if (!group.size) listeners.delete(type);
      };
    },
  };
  return {
    port,
    flush() {
      if (disposed || !queue.length) return;
      const batch = queue.splice(0, GAME_EVENT_LIMITS.deliveredPerTick);
      for (const event of batch) {
        // New subscriptions join the next event, never extend this delivery.
        const group = [...(listeners.get(event.type) ?? [])];
        for (const listener of group) {
          if (disposed) return;
          if (!listeners.get(event.type)?.has(listener)) continue;
          try { listener(event); } catch (error) { onError(error); }
        }
      }
    },
    dispose() {
      disposed = true; queue = [];
      for (const group of listeners.values()) group.clear();
      listeners.clear(); count = 0;
    },
  };
}
