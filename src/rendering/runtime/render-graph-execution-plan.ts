import type {
  CompiledRenderGraph,
  RenderPassId,
  RenderResourceId,
} from "./render-graph-definition";

export type RenderPassExecutionContext = Readonly<{
  passId: RenderPassId;
  passIndex: number;
  reads: readonly RenderResourceId[];
  writes: readonly RenderResourceId[];
}>;

export type RenderPassRunDecision =
  | Readonly<{ run: true }>
  | Readonly<{ run: false; reason: string }>;

export type RenderPassExecutionBinding<FrameContext> = Readonly<{
  passId: RenderPassId;
  condition?: (
    frame: FrameContext,
    context: RenderPassExecutionContext,
  ) => RenderPassRunDecision;
  execute: (frame: FrameContext, context: RenderPassExecutionContext) => void;
}>;

export type RenderPassExecutionDiagnostic =
  | Readonly<{
      passId: RenderPassId;
      passIndex: number;
      status: "executed";
    }>
  | Readonly<{
      passId: RenderPassId;
      passIndex: number;
      status: "skipped";
      code: "condition" | "missing-input";
      reason: string;
      missingInputs?: readonly RenderResourceId[];
    }>
  | Readonly<{
      passId: RenderPassId;
      passIndex: number;
      status: "failed";
      phase: "condition" | "execute";
      message: string;
      cause: unknown;
    }>;

export type RenderGraphExecutionReport = Readonly<{
  status: "complete" | "incomplete" | "failed";
  passes: readonly RenderPassExecutionDiagnostic[];
  unavailableOutputs: readonly RenderResourceId[];
}>;

export type RenderGraphExecutionPlan<FrameContext> = Readonly<{
  passIds: readonly RenderPassId[];
  execute: (frame: FrameContext) => RenderGraphExecutionReport;
}>;

export class RenderGraphExecutionPlanError extends Error {
  constructor(
    readonly code: "duplicate-binding" | "missing-binding" | "unknown-binding",
    message: string,
  ) {
    super(message);
    this.name = "RenderGraphExecutionPlanError";
  }
}

type PlanEntry<FrameContext> = Readonly<{
  context: RenderPassExecutionContext;
  binding: RenderPassExecutionBinding<FrameContext>;
}>;

/** Builds an immutable, caller-driven plan. It never schedules or repeats itself. */
export function createRenderGraphExecutionPlan<
  FrameContext,
  Descriptor = unknown,
  Payload = unknown,
>(
  graph: CompiledRenderGraph<Descriptor, Payload>,
  bindings: readonly RenderPassExecutionBinding<FrameContext>[],
): RenderGraphExecutionPlan<FrameContext> {
  const byPass = indexBindings(graph, bindings);
  const entries = Object.freeze(graph.passes.map((pass, passIndex): PlanEntry<FrameContext> =>
    Object.freeze({
      context: Object.freeze({
        passId: pass.id,
        passIndex,
        reads: Object.freeze([...pass.reads]),
        writes: Object.freeze([...pass.writes]),
      }),
      binding: byPass.get(pass.id)!,
    })));
  const passIds = Object.freeze(entries.map(({ context }) => context.passId));
  const outputs = Object.freeze([...graph.outputs]);
  const externalResources = graph.resources
    .filter(({ source }) => source === "external")
    .map(({ id }) => id);

  return Object.freeze({
    passIds,
    execute: (frame: FrameContext) => executeOnce(outputs, externalResources, entries, frame),
  });
}

function indexBindings<FrameContext, Descriptor, Payload>(
  graph: CompiledRenderGraph<Descriptor, Payload>,
  bindings: readonly RenderPassExecutionBinding<FrameContext>[],
): Map<RenderPassId, RenderPassExecutionBinding<FrameContext>> {
  const passIds = new Set(graph.passes.map(({ id }) => id));
  const indexed = new Map<RenderPassId, RenderPassExecutionBinding<FrameContext>>();
  for (const binding of bindings) {
    if (!passIds.has(binding.passId)) {
      throw new RenderGraphExecutionPlanError(
        "unknown-binding",
        `Execution binding '${binding.passId}' is not present in the compiled graph.`,
      );
    }
    if (indexed.has(binding.passId)) {
      throw new RenderGraphExecutionPlanError(
        "duplicate-binding",
        `Execution binding '${binding.passId}' is declared more than once.`,
      );
    }
    indexed.set(binding.passId, Object.freeze({ ...binding }));
  }
  for (const pass of graph.passes) {
    if (!indexed.has(pass.id)) {
      throw new RenderGraphExecutionPlanError(
        "missing-binding",
        `Compiled pass '${pass.id}' has no execution binding.`,
      );
    }
  }
  return indexed;
}

function executeOnce<FrameContext>(
  outputs: readonly RenderResourceId[],
  externalResources: readonly RenderResourceId[],
  entries: readonly PlanEntry<FrameContext>[],
  frame: FrameContext,
): RenderGraphExecutionReport {
  const available = new Set(externalResources);
  const diagnostics: RenderPassExecutionDiagnostic[] = [];
  let failed = false;

  for (const { context, binding } of entries) {
    const missingInputs = context.reads.filter((resourceId) => !available.has(resourceId)).sort(compareIds);
    if (missingInputs.length > 0) {
      diagnostics.push(Object.freeze({
        passId: context.passId,
        passIndex: context.passIndex,
        status: "skipped",
        code: "missing-input",
        reason: `Unavailable inputs: ${missingInputs.join(", ")}.`,
        missingInputs: Object.freeze(missingInputs),
      }));
      continue;
    }

    let decision: RenderPassRunDecision = { run: true };
    try {
      if (binding.condition) decision = binding.condition(frame, context);
    } catch (cause) {
      failed = true;
      diagnostics.push(failureDiagnostic(context.passId, context.passIndex, "condition", cause));
      continue;
    }
    if (!decision.run) {
      diagnostics.push(Object.freeze({
        passId: context.passId,
        passIndex: context.passIndex,
        status: "skipped",
        code: "condition",
        reason: decision.reason,
      }));
      continue;
    }

    try {
      binding.execute(frame, context);
      context.writes.forEach((resourceId) => available.add(resourceId));
      diagnostics.push(Object.freeze({
        passId: context.passId,
        passIndex: context.passIndex,
        status: "executed",
      }));
    } catch (cause) {
      failed = true;
      diagnostics.push(failureDiagnostic(context.passId, context.passIndex, "execute", cause));
    }
  }

  const unavailableOutputs = Object.freeze(outputs.filter((resourceId) => !available.has(resourceId)).sort(compareIds));
  return Object.freeze({
    status: failed ? "failed" : unavailableOutputs.length > 0 ? "incomplete" : "complete",
    passes: Object.freeze(diagnostics),
    unavailableOutputs,
  });
}

function failureDiagnostic(
  passId: RenderPassId,
  passIndex: number,
  phase: "condition" | "execute",
  cause: unknown,
): RenderPassExecutionDiagnostic {
  return Object.freeze({
    passId,
    passIndex,
    status: "failed",
    phase,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

function compareIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
