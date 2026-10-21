import { describe, expect, it, vi } from "vitest";
import { createRenderGraphExecutionPlan } from "../../../runtime/render-graph-execution-plan";
import type { ShadowCascadeUpdateInput } from "../../../runtime/shadows/shadow-cascade-update-planner";
import {
  dynamicCasterGeneration,
  shadowCameraGeneration,
  shadowCameraPoseGeneration,
  shadowExtentGeneration,
  shadowLightGeneration,
  staticCasterGeneration,
} from "../../../runtime/shadows/shadow-generations";
import { createThreeShadowPlanAdapter } from "./three-shadow-plan-adapter";

describe("Three WebGPU shadow plan adapter", () => {
  it("creates explicit persistent resources and ordered cascade update passes", () => {
    const frame = createThreeShadowPlanAdapter().plan(input());
    const graph = frame.graphContract.graph;
    const depthResources = graph.resources.filter(({ descriptor }) => (
      descriptor?.kind === "cascade-depth"
    ));

    expect(graph.passes.map(({ id }) => id)).toEqual([
      "shadow-cascade-0-near-update",
      "shadow-cascade-1-mid-update",
      "shadow-cascade-2-far-update",
    ]);
    expect(depthResources).toHaveLength(3);
    expect(depthResources.every(({ source, descriptor }) => (
      source === "external"
      && descriptor?.kind === "cascade-depth"
      && descriptor.lifetime === "history"
      && descriptor.owner === "three-shadow-node"
    ))).toBe(true);
    expect(graph.passes[0].reads).toContain("shadow-input-dynamic-casters");
    expect(graph.passes[1].reads).toContain("shadow-input-dynamic-casters");
    expect(graph.passes[2].reads).not.toContain("shadow-input-dynamic-casters");
    expect(frame.commands.map(({ mapSize }) => mapSize)).toEqual([2048, 1024, 512]);
    expect(frame.commands.every(({ update }) => update)).toBe(true);
  });

  it("reuses graph topology while projecting exact per-frame decisions", () => {
    const adapter = createThreeShadowPlanAdapter();
    const initial = adapter.plan(input());
    const stable = adapter.plan(input());
    const dynamic = adapter.plan(input({ dynamicCasters: 1, cameraPose: 1 }));

    expect(stable.graphContract).toBe(initial.graphContract);
    expect(stable.commands.every(({ update }) => !update)).toBe(true);
    expect(stable.updateFrustums).toBe(false);
    expect(dynamic.commands.map(({ update }) => update)).toEqual([true, true, false]);
    expect(dynamic.updateFrustums).toBe(false);
    expect(dynamic.commands[2].reasons).toEqual([]);
  });

  it("keeps cached history available when every update pass is skipped", () => {
    const adapter = createThreeShadowPlanAdapter();
    adapter.plan(input());
    const stable = adapter.plan(input());
    const execute = vi.fn();
    const commands = new Map(stable.commands.map((command) => [command.passId, command]));
    const plan = createRenderGraphExecutionPlan(stable.graphContract.graph, stable.graphContract.graph.passes
      .map((pass) => ({
        passId: pass.id,
        condition: () => commands.get(pass.id)!.update
          ? { run: true as const }
          : { run: false as const, reason: "Cascade history is reusable." },
        execute,
      })));

    const report = plan.execute({});

    expect(report.status).toBe("complete");
    expect(report.passes.every(({ status }) => status === "skipped")).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("requests a frustum refresh for projection or effective range changes", () => {
    const adapter = createThreeShadowPlanAdapter();
    const initial = adapter.plan(input());
    const range = adapter.plan({ ...input(), camera: { near: 0.1, far: 1_000, maxShadowDistance: 180 } });
    const projection = adapter.plan(input({ camera: 1 }));

    expect(initial.updateFrustums).toBe(true);
    expect(range.updateFrustums).toBe(true);
    expect(range.shadowFar).toBe(180);
    expect(range.normalizedBreaks[2]).toBe(1);
    expect(projection.updateFrustums).toBe(true);
  });
});

function input(
  values: Readonly<{
    camera?: number;
    cameraPose?: number;
    dynamicCasters?: number;
  }> = {},
): ShadowCascadeUpdateInput {
  return Object.freeze({
    camera: Object.freeze({ near: 0.1, far: 1_000, maxShadowDistance: 120 }),
    cameraPosition: Object.freeze({ x: 0, y: 0, z: 0 }),
    generations: Object.freeze({
      camera: shadowCameraGeneration(values.camera ?? 0),
      cameraPose: shadowCameraPoseGeneration(values.cameraPose ?? 0),
      light: shadowLightGeneration(0),
      extent: shadowExtentGeneration(0),
      staticCasters: staticCasterGeneration(0),
      dynamicCasters: dynamicCasterGeneration(values.dynamicCasters ?? 0),
    }),
  });
}
