declare const renderPassIdBrand: unique symbol;
declare const renderResourceIdBrand: unique symbol;

/** Stable graph identity. The brand prevents pass and resource IDs being mixed. */
export type RenderPassId = string & { readonly [renderPassIdBrand]: true };
export type RenderResourceId = string & { readonly [renderResourceIdBrand]: true };

export function renderPassId(value: string): RenderPassId {
  return value as RenderPassId;
}

export function renderResourceId(value: string): RenderResourceId {
  return value as RenderResourceId;
}

/**
 * Graph resources require a producer. External resources are available before
 * graph execution, although a graph pass may still write them (for example a
 * presentation surface).
 */
export type RenderResourceSource = "graph" | "external";

export type RenderGraphResource<Descriptor = unknown> = Readonly<{
  id: RenderResourceId;
  source: RenderResourceSource;
  descriptor?: Descriptor;
}>;

export type RenderGraphPass<Payload = unknown> = Readonly<{
  id: RenderPassId;
  reads: readonly RenderResourceId[];
  writes: readonly RenderResourceId[];
  /** Keeps work whose result is observable outside declared graph outputs. */
  sideEffect?: boolean;
  payload?: Payload;
}>;

export type RenderGraphDefinition<Descriptor = unknown, Payload = unknown> = Readonly<{
  resources: readonly RenderGraphResource<Descriptor>[];
  passes: readonly RenderGraphPass<Payload>[];
  outputs: readonly RenderResourceId[];
}>;

export type CompiledRenderGraph<Descriptor = unknown, Payload = unknown> = Readonly<{
  resources: readonly RenderGraphResource<Descriptor>[];
  passes: readonly RenderGraphPass<Payload>[];
  outputs: readonly RenderResourceId[];
  prunedPasses: readonly RenderPassId[];
}>;
