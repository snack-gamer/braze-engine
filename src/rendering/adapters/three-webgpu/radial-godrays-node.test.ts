import * as THREE from "three";
import { HalfFloatType, RedFormat, RendererUtils, type NodeFrame } from "three/webgpu";
import { describe, expect, it, vi } from "vitest";
import { texture } from "../../../three/tsl";
import { RadialGodraysNode } from "./radial-godrays-node";

describe("radial godrays node", () => {
  it("owns one half-resolution scalar contribution target", () => {
    const node = createNode();
    const size = new THREE.Vector2();

    expect(node.setSize(3840, 2160)).toBe(true);
    expect(node.getSize(size).toArray()).toEqual([1920, 1080]);
    expect(node.setSize(3840, 2160)).toBe(false);
    expect(node.getTextureNode().value.format).toBe(RedFormat);
    expect(node.getTextureNode().value.type).toBe(HalfFloatType);
    expect(() => node.setSize(Number.NaN, 1080)).toThrow(/width/);
    node.dispose();
  });

  it("restores Three renderer state when a collapsed surface rejects its size", () => {
    const savedState = {} as ReturnType<typeof RendererUtils.saveRendererState>;
    const restore = vi.fn();
    const rendererStateOperations = {
      saveRendererState: vi.fn(() => savedState),
      resetRendererState: vi.fn(() => savedState),
      restoreRendererState: restore,
    };
    const renderer = {
      getDrawingBufferSize: (target: THREE.Vector2) => target.set(0, 0),
    };
    const node = createNode(rendererStateOperations);

    expect(() => node.updateBefore({ renderer } as NodeFrame)).toThrow(/width/);
    expect(restore).toHaveBeenCalledWith(renderer, savedState);
    node.dispose();
  });
});

function createNode(rendererStateOperations?: Pick<
  typeof RendererUtils,
  "resetRendererState" | "restoreRendererState" | "saveRendererState"
>): RadialGodraysNode {
  return new RadialGodraysNode(
    texture(new THREE.Texture()),
    new THREE.PerspectiveCamera(),
    new THREE.DirectionalLight(),
    rendererStateOperations,
  );
}
