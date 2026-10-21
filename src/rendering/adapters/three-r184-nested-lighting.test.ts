import { describe, expect, it } from "vitest";
import { Camera, DirectionalLight, Object3D, Scene } from "three";
import { LightsNode } from "three/webgpu";
import { installThreeR184NestedLighting } from "./three-r184-nested-lighting";

function fixture() {
  const original = new LightsNode();
  const lighting = {
    createNode: () => new LightsNode(),
    getNode: (_scene: Object3D, _camera?: Camera) => original,
  };
  installThreeR184NestedLighting({ lighting });
  return { lighting, original };
}

describe("Three r184 nested lighting", () => {
  it("isolates cached main-view lighting from empty shadow-camera lighting", () => {
    const { lighting } = fixture(), scene = new Scene();
    const mainCamera = new Camera(), shadowCamera = new Camera();
    const main = lighting.getNode(scene, mainCamera);
    const sun = new DirectionalLight(); main.setLights([sun]);
    const hash = main.customCacheKey();
    const shadow = lighting.getNode(scene, shadowCamera); shadow.setLights([]);
    expect(shadow).not.toBe(main);
    expect(main.getLights()).toEqual([sun]); expect(main.customCacheKey()).toBe(hash);
    expect(lighting.getNode(scene, mainCamera)).toBe(main);
    expect(lighting.getNode(scene, shadowCamera)).toBe(shadow);
  });
  it("keeps scene lifetimes separate while retaining the postprocessing/default lookup", () => {
    const { lighting, original } = fixture(), camera = new Camera(), first = new Scene(), second = new Scene();
    expect(lighting.getNode(first, camera)).not.toBe(lighting.getNode(second, camera));
    expect(lighting.getNode(first)).toBe(original);
    const quad = Object.assign(new Object3D(), { isQuadMesh: true });
    expect(lighting.getNode(quad, camera)).toBe(original);
  });
});
