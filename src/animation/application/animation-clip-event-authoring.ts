import { createAuthoredId } from "../../identity/authored-id";
import {
  MAX_MODEL_ANIMATION_EVENTS,
  normalizeModelAnimationEvents,
  type ModelAnimationClipSettings,
  type ModelAnimationEventSettings,
  type ModelImportSettings,
} from "../../lib/model-import-settings";

export type AnimationClipEventTarget = Readonly<{
  localId: string;
  durationSeconds: number;
  looping: boolean;
  sourceEvents?: readonly ModelAnimationEventSettings[];
}>;

export function animationClipEvents(
  settings: ModelImportSettings,
  target: AnimationClipEventTarget,
): readonly ModelAnimationEventSettings[] {
  const events = settings.clipSettings[target.localId]?.events
    ?? normalizeModelAnimationEvents(target.sourceEvents);
  const duration = Math.max(0, target.durationSeconds);
  return events.every((event) => event.timeSeconds <= duration)
    ? events
    : events.map((event) => ({ ...event, timeSeconds: Math.min(duration, event.timeSeconds) }));
}

export function addAnimationClipEvent(
  settings: ModelImportSettings,
  target: AnimationClipEventTarget,
  timeSeconds: number,
  options: Readonly<{ id?: string; name?: string }> = {},
): Readonly<{ settings: ModelImportSettings; eventId: string }> {
  const events = animationClipEvents(settings, target);
  if (events.length >= MAX_MODEL_ANIMATION_EVENTS) {
    throw new Error(`A clip cannot exceed ${MAX_MODEL_ANIMATION_EVENTS} events.`);
  }
  const eventId = options.id ?? createAuthoredId("animation-event");
  if (events.some((event) => event.id === eventId)) {
    throw new Error(`Animation event '${eventId}' already exists.`);
  }
  const event: ModelAnimationEventSettings = {
    id: eventId,
    name: authoredText(options.name ?? `Event ${events.length + 1}`, "Event name"),
    timeSeconds: clipTime(timeSeconds, target.durationSeconds),
    payload: {},
  };
  return {
    eventId,
    settings: withEvents(settings, target, [...events, event]),
  };
}

export function patchAnimationClipEvent(
  settings: ModelImportSettings,
  target: AnimationClipEventTarget,
  eventId: string,
  patch: Partial<Pick<ModelAnimationEventSettings, "name" | "timeSeconds">>,
): ModelImportSettings {
  return updateEvent(settings, target, eventId, (event) => ({
    ...event,
    ...(patch.name === undefined ? {} : { name: authoredText(patch.name, "Event name") }),
    ...(patch.timeSeconds === undefined
      ? {}
      : { timeSeconds: clipTime(patch.timeSeconds, target.durationSeconds) }),
  }));
}

export function removeAnimationClipEvent(
  settings: ModelImportSettings,
  target: AnimationClipEventTarget,
  eventId: string,
): ModelImportSettings {
  const events = animationClipEvents(settings, target);
  if (!events.some((event) => event.id === eventId)) {
    throw new Error(`Animation event '${eventId}' was not found.`);
  }
  return withEvents(settings, target, events.filter((event) => event.id !== eventId));
}

function updateEvent(
  settings: ModelImportSettings,
  target: AnimationClipEventTarget,
  eventId: string,
  update: (event: ModelAnimationEventSettings) => ModelAnimationEventSettings,
): ModelImportSettings {
  let found = false;
  const events = animationClipEvents(settings, target).map((event) => {
    if (event.id !== eventId) return event;
    found = true;
    return update(event);
  });
  if (!found) throw new Error(`Animation event '${eventId}' was not found.`);
  return withEvents(settings, target, events);
}

function withEvents(
  settings: ModelImportSettings,
  target: AnimationClipEventTarget,
  events: readonly ModelAnimationEventSettings[],
): ModelImportSettings {
  const current = settings.clipSettings[target.localId];
  const clip: ModelAnimationClipSettings = {
    ...(current ?? {}),
    looping: current?.looping ?? target.looping,
    events: normalizeModelAnimationEvents(events),
  };
  return {
    ...settings,
    clipSettings: { ...settings.clipSettings, [target.localId]: clip },
  };
}

function authoredText(value: string, purpose: string): string {
  const result = value.trim();
  if (!result) throw new Error(`${purpose} cannot be empty.`);
  return result;
}

function clipTime(value: number, durationSeconds: number): number {
  const duration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  return Number.isFinite(value) ? Math.min(duration, Math.max(0, value)) : 0;
}
