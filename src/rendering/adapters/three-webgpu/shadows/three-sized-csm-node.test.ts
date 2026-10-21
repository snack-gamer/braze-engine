import { describe, expect, it } from "vitest";
import { DirectionalLight, PerspectiveCamera, WebGPUCoordinateSystem, type NodeBuilder } from "three/webgpu";
import { ThreeSizedCsmNode } from "./three-sized-csm-node";

describe("initial cascade allocation", () => {
  it("gives lazily created lights their final sizes before shader building allocates targets", () => {
    const light = new DirectionalLight();
    const csm = new ThreeSizedCsmNode(light, { cascades: 3, maxFar: 120 });
    expect(csm.lights).toHaveLength(0);
    // Graph setup reads only camera/coordinateSystem; GPU compilation occurs later.
    csm.setup({ camera: new PerspectiveCamera(50, 1, .1, 200), renderer: { coordinateSystem: WebGPUCoordinateSystem } } as unknown as NodeBuilder);
    expect(csm.lights.map(({ shadow }) => shadow!.mapSize.toArray())).toEqual([[2048, 2048], [1024, 1024], [512, 512]]);
    expect(csm.lights.every(({ shadow }) => shadow!.map === null)).toBe(true);
    csm.dispose();
  });
});
