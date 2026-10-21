import { describe, expect, it } from "vitest";
import {
  renderPassId,
  renderResourceId,
  type RenderGraphDefinition,
  type RenderGraphPass,
  type RenderGraphResource,
} from "./render-graph-definition";
import { RenderGraphCompileError, compileRenderGraph } from "./render-graph-compiler";

const resource = (
  id: string,
  source: RenderGraphResource["source"] = "graph",
): RenderGraphResource => ({ id: renderResourceId(id), source });

const pass = (
  id: string,
  reads: string[] = [],
  writes: string[] = [],
  sideEffect = false,
): RenderGraphPass => ({
  id: renderPassId(id),
  reads: reads.map(renderResourceId),
  writes: writes.map(renderResourceId),
  sideEffect,
});

function definition(
  resources: RenderGraphResource[],
  passes: RenderGraphPass[],
  outputs: string[],
): RenderGraphDefinition {
  return { resources, passes, outputs: outputs.map(renderResourceId) };
}

describe("render graph compiler", () => {
  it("orders dependencies deterministically regardless of declaration order", () => {
    const resources = [
      resource("gbuffer"),
      resource("lit"),
      resource("presented"),
    ];
    const passes = [
      pass("scene", [], ["gbuffer"]),
      pass("lighting", ["gbuffer"], ["lit"]),
      pass("present", ["lit"], ["presented"]),
      pass("telemetry", [], [], true),
    ];
    const forward = compileRenderGraph(definition(resources, passes, ["presented"]));
    const reversed = compileRenderGraph(definition(resources, [...passes].reverse(), ["presented"]));

    expect(forward.passes.map(({ id }) => id)).toEqual([
      "scene",
      "lighting",
      "present",
      "telemetry",
    ]);
    expect(reversed.passes.map(({ id }) => id)).toEqual(forward.passes.map(({ id }) => id));
  });

  it("rejects dependency cycles", () => {
    const graph = definition(
      [resource("a"), resource("b")],
      [pass("write-a", ["b"], ["a"]), pass("write-b", ["a"], ["b"])],
      ["a"],
    );

    expect(() => compileRenderGraph(graph)).toThrowError(expect.objectContaining({ code: "cycle" }));
  });

  it("rejects graph inputs without a producer", () => {
    const graph = definition(
      [resource("missing"), resource("output")],
      [pass("present", ["missing"], ["output"])],
      ["output"],
    );

    expect(() => compileRenderGraph(graph)).toThrowError(
      expect.objectContaining<Partial<RenderGraphCompileError>>({ code: "missing-producer" }),
    );
  });

  it("allows external inputs without a graph producer", () => {
    const graph = definition(
      [resource("asset", "external"), resource("output")],
      [pass("present", ["asset"], ["output"])],
      ["output"],
    );

    expect(compileRenderGraph(graph).passes.map(({ id }) => id)).toEqual(["present"]);
  });

  it("rejects multiple writers for one logical resource", () => {
    const graph = definition(
      [resource("shared")],
      [pass("first", [], ["shared"]), pass("second", [], ["shared"])],
      ["shared"],
    );

    expect(() => compileRenderGraph(graph)).toThrowError(
      expect.objectContaining<Partial<RenderGraphCompileError>>({ code: "multiple-writers" }),
    );
  });

  it("prunes passes and resources that do not contribute to an output or side effect", () => {
    const graph = definition(
      [
        resource("color"),
        resource("debug"),
        resource("final"),
        resource("telemetry-data"),
      ],
      [
        pass("debug-view", [], ["debug"]),
        pass("present", ["color"], ["final"]),
        pass("scene", [], ["color"]),
        pass("telemetry", ["telemetry-data"], [], true),
        pass("telemetry-source", [], ["telemetry-data"]),
      ],
      ["final"],
    );

    const compiled = compileRenderGraph(graph);

    expect(compiled.passes.map(({ id }) => id)).toEqual([
      "scene",
      "present",
      "telemetry-source",
      "telemetry",
    ]);
    expect(compiled.resources.map(({ id }) => id)).toEqual([
      "color",
      "final",
      "telemetry-data",
    ]);
    expect(compiled.prunedPasses).toEqual(["debug-view"]);
  });
});
