export type RuntimeAnimationEvent = Readonly<{
  id: string;
  timeSeconds: number;
  name: string;
  payload?: unknown;
}>;

export type FiredAnimationEvent = Readonly<{
  event: RuntimeAnimationEvent;
  occurrenceTimeSeconds: number;
}>;

export type AnimationEventCollection = Readonly<{
  fired: readonly FiredAnimationEvent[];
  truncated: boolean;
}>;

type CollectAnimationEventsOptions = Readonly<{
  durationSeconds: number;
  looping: boolean;
  maxEvents?: number;
}>;

/**
 * Collects markers crossed between two unwrapped clip times. Forward intervals
 * are `(previous, current]`; reverse intervals are `[current, previous)`.
 */
export function collectAnimationEvents(
  events: readonly RuntimeAnimationEvent[],
  previousTimeSeconds: number,
  currentTimeSeconds: number,
  options: CollectAnimationEventsOptions,
): AnimationEventCollection {
  const duration = options.durationSeconds;
  const requestedLimit = options.maxEvents ?? 256;
  const maxEvents = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.floor(requestedLimit))
    : 256;
  if (
    !Number.isFinite(previousTimeSeconds)
    || !Number.isFinite(currentTimeSeconds)
    || !Number.isFinite(duration)
    || duration <= 0
    || previousTimeSeconds === currentTimeSeconds
  ) return { fired: [], truncated: false };

  const valid = events
    .map((event, order) => ({ event, order }))
    .filter(({ event }) => event.id && Number.isFinite(event.timeSeconds)
      && event.timeSeconds >= 0 && event.timeSeconds <= duration);
  const occurrences: Array<FiredAnimationEvent & { order: number }> = [];
  const forward = currentTimeSeconds > previousTimeSeconds;
  for (const { event, order } of valid) {
    if (!options.looping) {
      if (crossed(event.timeSeconds, previousTimeSeconds, currentTimeSeconds, forward)) {
        occurrences.push({ event, occurrenceTimeSeconds: event.timeSeconds, order });
      }
      continue;
    }
    const cycleRange = crossedLoopCycles(
      event.timeSeconds,
      duration,
      previousTimeSeconds,
      currentTimeSeconds,
      forward,
    );
    const cycleCount = Math.max(0, cycleRange.last - cycleRange.first + 1);
    const retainedCount = Math.min(cycleCount, maxEvents + 1);
    for (let offset = 0; offset < retainedCount; offset += 1) {
      const cycle = forward ? cycleRange.first + offset : cycleRange.last - offset;
      const occurrence = event.timeSeconds + cycle * duration;
      occurrences.push({ event, occurrenceTimeSeconds: occurrence, order });
    }
  }
  occurrences.sort((left, right) => (
    (forward
      ? left.occurrenceTimeSeconds - right.occurrenceTimeSeconds
      : right.occurrenceTimeSeconds - left.occurrenceTimeSeconds)
    || left.order - right.order
    || left.event.id.localeCompare(right.event.id)
  ));
  return {
    fired: occurrences.slice(0, maxEvents).map(({ order: _order, ...event }) => event),
    truncated: occurrences.length > maxEvents,
  };
}

function crossedLoopCycles(
  eventTime: number,
  duration: number,
  previous: number,
  current: number,
  forward: boolean,
): { first: number; last: number } {
  return forward
    ? {
        first: Math.floor((previous - eventTime) / duration) + 1,
        last: Math.floor((current - eventTime) / duration),
      }
    : {
        first: Math.ceil((current - eventTime) / duration),
        last: Math.ceil((previous - eventTime) / duration) - 1,
      };
}

function crossed(eventTime: number, previous: number, current: number, forward: boolean): boolean {
  return forward
    ? eventTime > previous && eventTime <= current
    : eventTime >= current && eventTime < previous;
}
