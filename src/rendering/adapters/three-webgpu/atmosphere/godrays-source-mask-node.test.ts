import * as THREE from "three";
import { RedFormat, UnsignedByteType } from "three/webgpu";
import { describe, expect, it } from "vitest";
import { texture } from "../../../../three/tsl";
import { GodraysSourceMaskNode } from "./godrays-source-mask-node";

describe("godrays source mask node", () => {
  it("owns one half-resolution R8 source target", () => {
    const node = new GodraysSourceMaskNode(
      texture(new THREE.Texture()),
      texture(new THREE.Texture()),
      true,
    );
    const size = new THREE.Vector2();

    expect(node.setSize(3840, 2160)).toBe(true);
    expect(node.getSize(size).toArray()).toEqual([1920, 1080]);
    expect(node.setSize(3840, 2160)).toBe(false);
    expect(node.getTextureNode().value.format).toBe(RedFormat);
    expect(node.getTextureNode().value.type).toBe(UnsignedByteType);
    expect(() => node.setSize(3840, 0)).toThrow(/height/);
    node.dispose();
  });
});
