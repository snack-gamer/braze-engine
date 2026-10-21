export const RENDER_WORLD_INVALIDATION_CHANNELS = [
  "structure",
  "transforms",
  "poses",
  "materials",
  "lighting",
  "environment",
  "particles",
  "shadowCasters",
  "labels",
] as const;

export const RENDER_VIEW_INVALIDATION_CHANNELS = [
  "camera",
  "extent",
  "visibility",
  "overlays",
  "postProcessing",
  "history",
] as const;

export type RenderWorldInvalidationChannel = (typeof RENDER_WORLD_INVALIDATION_CHANNELS)[number];
export type RenderViewInvalidationChannel = (typeof RENDER_VIEW_INVALIDATION_CHANNELS)[number];

export type RenderWorldGenerations = Readonly<
  Record<RenderWorldInvalidationChannel, number> & { revision: number }
>;

export type RenderViewGenerations = Readonly<
  Record<RenderViewInvalidationChannel, number> & { revision: number }
>;

type GenerationSnapshot<Channel extends string> = Readonly<Record<Channel, number> & { revision: number }>;

function initialGenerations<Channel extends string>(
  channels: readonly Channel[],
): GenerationSnapshot<Channel> {
  const values: Record<string, number> = { revision: 0 };
  for (const channel of channels) values[channel] = 0;
  return Object.freeze(values) as GenerationSnapshot<Channel>;
}

function nextRevision(current: number): number {
  if (!Number.isSafeInteger(current) || current < 0 || current === Number.MAX_SAFE_INTEGER) {
    throw new Error("Render invalidation revision is outside the safe integer range.");
  }
  return current + 1;
}

/**
 * Tracks immutable invalidation generations for one fixed set of channels.
 * A snapshot is allocated only when a producer invalidates state; frame readers
 * compare stable snapshot references and numeric generations without mutation.
 */
class RenderInvalidationLedger<Channel extends string> {
  private generations: GenerationSnapshot<Channel>;

  constructor(private readonly channels: readonly Channel[]) {
    this.generations = initialGenerations(channels);
  }

  current(): GenerationSnapshot<Channel> {
    return this.generations;
  }

  invalidate(changedChannels: readonly Channel[]): GenerationSnapshot<Channel> {
    if (changedChannels.length === 0) return this.generations;
    const revision = nextRevision(this.generations.revision);
    const next: Record<string, number> = { ...this.generations, revision };
    for (const channel of changedChannels) next[channel] = revision;
    this.generations = Object.freeze(next) as GenerationSnapshot<Channel>;
    return this.generations;
  }

  reset(): GenerationSnapshot<Channel> {
    this.generations = initialGenerations(this.channels);
    return this.generations;
  }
}

export class RenderWorldInvalidationLedger {
  private readonly ledger = new RenderInvalidationLedger(RENDER_WORLD_INVALIDATION_CHANNELS);

  current(): RenderWorldGenerations {
    return this.ledger.current();
  }

  invalidate(
    ...changedChannels: readonly RenderWorldInvalidationChannel[]
  ): RenderWorldGenerations {
    return this.ledger.invalidate(changedChannels);
  }

  reset(): RenderWorldGenerations {
    return this.ledger.reset();
  }
}

export class RenderViewInvalidationLedger {
  private readonly ledger = new RenderInvalidationLedger(RENDER_VIEW_INVALIDATION_CHANNELS);

  current(): RenderViewGenerations {
    return this.ledger.current();
  }

  invalidate(
    ...changedChannels: readonly RenderViewInvalidationChannel[]
  ): RenderViewGenerations {
    return this.ledger.invalidate(changedChannels);
  }

  reset(): RenderViewGenerations {
    return this.ledger.reset();
  }
}

export function renderWorldGenerationChanged(
  current: RenderWorldGenerations,
  consumed: RenderWorldGenerations,
  channel: RenderWorldInvalidationChannel,
): boolean {
  return current[channel] !== consumed[channel];
}

export function renderViewGenerationChanged(
  current: RenderViewGenerations,
  consumed: RenderViewGenerations,
  channel: RenderViewInvalidationChannel,
): boolean {
  return current[channel] !== consumed[channel];
}
