import { describe, expect, it } from "vitest";
import { float, uniform, vec2, vec3 } from "../tsl";
import { cloudHash2d } from "./cloud-noise-nodes";
import { CLOUD_VOLUME_SLICE_COUNT, cloudsLayer } from "./cloud-nodes";

type InspectableNode = {
  isNode?: boolean;
  method?: string;
  [key: string]: unknown;
};

describe("procedural cloud noise graph", () => {
  it("uses an ordinary-ALU lattice hash with no trigonometric node", () => {
    const hash = cloudHash2d(vec2(uniform(12.5), uniform(-3.75)));
    const nodes = collectNodes(hash);
    const methods = nodes.flatMap((node) => typeof node.method === "string" ? [node.method] : []);

    expect(methods).toContain("dot");
    expect(methods).toContain("fract");
    expect(methods).not.toEqual(expect.arrayContaining(["sin", "cos", "tan"]));
  });

  it("keeps every authored cloud control live in the four-slice graph", () => {
    const controls = [
      uniform(0.46), // coverage
      uniform(0.70), // density
      uniform(0.76), // depth
      uniform(0.82), // scale
      uniform(1.20), // detail
      uniform(0.62), // complexity
      uniform(1.35), // contrast
      uniform(0.44), // warp
      uniform(0.62), // billow
      uniform(0.18), // streaks
      uniform(0.42), // erosion
      uniform(0.55), // weather
      uniform(0.35), // top variation
      uniform(0.74), // absorption
      uniform(0.18), // scattering
      uniform(1.14), // self shadow
      uniform(1.35), // shadow strength
      uniform(1.25), // shadow detail
      uniform(0.30), // speed
    ] as const;
    const graph = cloudsLayer(
      vec3(0.2, 0.8, 0.3),
      vec3(0.4, 0.8, 0.2),
      float(0.8),
      float(0.0),
      float(0.0),
      ...controls,
    );
    const nodes = collectNodes(graph);
    const reachable = new Set<object>(nodes);
    const methods = nodes.flatMap((node) => typeof node.method === "string" ? [node.method] : []);

    for (const control of controls) expect(reachable.has(control)).toBe(true);
    expect(CLOUD_VOLUME_SLICE_COUNT).toBe(4);
    expect(methods).not.toContain("sin");
  });
});

function collectNodes(root: unknown): InspectableNode[] {
  const pending: unknown[] = [root];
  const visited = new Set<object>();
  const result: InspectableNode[] = [];
  while (pending.length > 0) {
    const candidate = pending.pop();
    if (!candidate || typeof candidate !== "object" || visited.has(candidate)) continue;
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      pending.push(...candidate);
      continue;
    }
    const node = candidate as InspectableNode;
    if (node.isNode !== true) continue;
    result.push(node);
    pending.push(...Object.values(node));
  }
  return result;
}
