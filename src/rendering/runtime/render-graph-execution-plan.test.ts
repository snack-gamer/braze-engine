import { describe, expect, it, vi } from "vitest";
import { compileRenderGraph } from "./render-graph-compiler";
import {
  renderPassId,
  renderResourceId,
  type RenderGraphDefinition,
} from "./render-graph-definition";
import {
  createRenderGraphExecutionPlan,
  type RenderPassExecutionBinding,
} from "./render-graph-execution-plan";

type Frame = Readonly<{ skipScene?: boolean }>;

function compiledGraph() {
  const graph: RenderGraphDefinition = {
    resources: [
      { id: renderResourceId("scene"), source: "graph" },
      { id: renderResourceId("final"), source: "graph" },
    ],
    passes: [
      { id: renderPassId("scene"), reads: [], writes: [renderResourceId("scene")] },
      {
        id: renderPassId("present"),
        reads: [renderResourceId("scene")],
        writes: [renderResourceId("final")],
      },
      { id: renderPassId("telemetry"), reads: [], writes: [], sideEffect: true },
    ],
    outputs: [renderResourceId("final")],
  };
  return compileRenderGraph(graph);
}

describe("render graph execution plan", () => {
  it("is immutable and only invokes callbacks during an explicit execution", () => {
    const calls: string[] = [];
    const bindings: RenderPassExecutionBinding<Frame>[] = ["scene", "present", "telemetry"].map((id) => ({
      passId: renderPassId(id),
      execute: (_frame, context) => calls.push(`${context.passIndex}:${context.passId}`),
    }));

    const plan = createRenderGraphExecutionPlan(compiledGraph(), bindings);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.passIds)).toBe(true);
    expect(calls).toEqual([]);

    const report = plan.execute({});
    expect(calls).toEqual(["0:scene", "1:present", "2:telemetry"]);
    expect(report.status).toBe("complete");
    expect(report.passes.map(({ status }) => status)).toEqual(["executed", "executed", "executed"]);
  });

  it("snapshots graph metadata so source mutation cannot change the plan", () => {
    const graph = compiledGraph();
    const calls: string[] = [];
    const plan = createRenderGraphExecutionPlan<Frame>(graph, ["scene", "present", "telemetry"].map((id) => ({
      passId: renderPassId(id),
      execute: (_frame, context) => calls.push(context.passId),
    })));

    const mutablePasses = graph.passes as unknown as { writes: string[] }[];
    const mutableOutputs = graph.outputs as unknown as string[];
    mutablePasses[0].writes.length = 0;
    mutableOutputs.splice(0, 1, "unproduced");

    expect(plan.execute({}).status).toBe("complete");
    expect(calls).toEqual(["scene", "present", "telemetry"]);
  });

  it("skips dependent work deterministically when a producer condition declines", () => {
    const present = vi.fn();
    const telemetry = vi.fn();
    const plan = createRenderGraphExecutionPlan<Frame>(compiledGraph(), [
      {
        passId: renderPassId("scene"),
        condition: (frame) => frame.skipScene
          ? { run: false, reason: "Scene is clean." }
          : { run: true },
        execute: vi.fn(),
      },
      { passId: renderPassId("present"), execute: present },
      { passId: renderPassId("telemetry"), execute: telemetry },
    ]);

    const report = plan.execute({ skipScene: true });

    expect(present).not.toHaveBeenCalled();
    expect(telemetry).toHaveBeenCalledOnce();
    expect(report.status).toBe("incomplete");
    expect(report.passes).toMatchObject([
      { passId: "scene", status: "skipped", code: "condition", reason: "Scene is clean." },
      { passId: "present", status: "skipped", code: "missing-input", missingInputs: ["scene"] },
      { passId: "telemetry", status: "executed" },
    ]);
    expect(report.unavailableOutputs).toEqual(["final"]);
  });

  it("records failures while allowing independent passes to finish", () => {
    const telemetry = vi.fn();
    const plan = createRenderGraphExecutionPlan<Frame>(compiledGraph(), [
      {
        passId: renderPassId("scene"),
        execute: () => { throw new Error("encoder failed"); },
      },
      { passId: renderPassId("present"), execute: vi.fn() },
      { passId: renderPassId("telemetry"), execute: telemetry },
    ]);

    const report = plan.execute({});

    expect(report.status).toBe("failed");
    expect(report.passes).toMatchObject([
      { passId: "scene", status: "failed", phase: "execute", message: "encoder failed" },
      { passId: "present", status: "skipped", code: "missing-input" },
      { passId: "telemetry", status: "executed" },
    ]);
    expect(telemetry).toHaveBeenCalledOnce();
  });

  it("rejects a plan with missing callbacks", () => {
    expect(() => createRenderGraphExecutionPlan<Frame>(compiledGraph(), [])).toThrowError(
      expect.objectContaining({ code: "missing-binding" }),
    );
  });
});
