import { describe, expect, it } from "vitest";
import {
  renderPassId,
  renderResourceId,
  type RenderGraphDefinition,
} from "./render-graph-definition";
import { compileRenderGraph } from "./render-graph-compiler";
import { analyzeRenderResourceLifetimes } from "./render-resource-lifetimes";

describe("render resource lifetime analysis", () => {
  it("reports first writes, final reads, and the output export boundary", () => {
    const graph: RenderGraphDefinition = {
      resources: [
        { id: renderResourceId("asset"), source: "external" },
        { id: renderResourceId("color"), source: "graph" },
        { id: renderResourceId("normal"), source: "graph" },
        { id: renderResourceId("ao"), source: "graph" },
        { id: renderResourceId("final"), source: "graph" },
        { id: renderResourceId("dead"), source: "graph" },
      ],
      passes: [
        {
          id: renderPassId("scene"),
          reads: [renderResourceId("asset")],
          writes: [renderResourceId("color"), renderResourceId("normal")],
        },
        {
          id: renderPassId("ao"),
          reads: [renderResourceId("normal")],
          writes: [renderResourceId("ao")],
        },
        {
          id: renderPassId("composite"),
          reads: [renderResourceId("color"), renderResourceId("ao")],
          writes: [renderResourceId("final")],
        },
        {
          id: renderPassId("dead-pass"),
          reads: [],
          writes: [renderResourceId("dead")],
        },
      ],
      outputs: [renderResourceId("final")],
    };

    const compiled = compileRenderGraph(graph);
    const lifetimes = analyzeRenderResourceLifetimes(compiled);
    const byId = new Map(lifetimes.map((lifetime) => [lifetime.resource.id, lifetime]));

    expect(byId.get(renderResourceId("asset"))).toMatchObject({
      firstWrite: null,
      lastRead: 0,
      firstUse: 0,
      lastUse: 0,
      exported: false,
    });
    expect(byId.get(renderResourceId("normal"))).toMatchObject({
      firstWrite: 0,
      lastRead: 1,
      firstUse: 0,
      lastUse: 1,
      exported: false,
    });
    expect(byId.get(renderResourceId("ao"))).toMatchObject({
      firstWrite: 1,
      lastRead: 2,
      firstUse: 1,
      lastUse: 2,
      exported: false,
    });
    expect(byId.get(renderResourceId("color"))).toMatchObject({
      firstWrite: 0,
      lastRead: 2,
      firstUse: 0,
      lastUse: 2,
      exported: false,
    });
    expect(byId.get(renderResourceId("final"))).toMatchObject({
      firstWrite: 2,
      lastRead: null,
      firstUse: 2,
      lastUse: 3,
      exported: true,
    });
    expect(byId.has(renderResourceId("dead"))).toBe(false);
  });
});
