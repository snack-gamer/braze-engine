import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  THREE_DYNAMIC_SHADOW_CASTER_LAYER,
  THREE_STATIC_SHADOW_CASTER_LAYER,
} from "../rendering/adapters/three-webgpu/shadows/three-shadow-caster-layers";
import type { SceneObject } from "../types";
import { createDirectionalShadowRuntime } from "./shadows";

describe("directional shadow runtime", () => {
  it("configures demand-driven CSM and classifies authored caster bodies", () => {
    const light = new THREE.DirectionalLight();
    const runtime = createDirectionalShadowRuntime(renderer(), light);
    const staticNode = nodeWithCaster();
    const dynamicNode = nodeWithCaster();
    const objects = [object("static"), object("dynamic", { animationPlayer: { enabled: true } })];

    runtime.syncAuthoredCasters(objects, new Map([
      ["static", staticNode.node],
      ["dynamic", dynamicNode.node],
    ]));

    expect(light.shadow.autoUpdate).toBe(false);
    expect(light.shadow.mapSize.toArray()).toEqual([512, 512]);
    expect(staticNode.mesh.layers.isEnabled(THREE_STATIC_SHADOW_CASTER_LAYER)).toBe(true);
    expect(dynamicNode.mesh.layers.isEnabled(THREE_DYNAMIC_SHADOW_CASTER_LAYER)).toBe(true);
    runtime.dispose();
  });
});

function renderer() {
  return {
    shadowMap: { enabled: false, type: THREE.PCFShadowMap },
  } as unknown as Parameters<typeof createDirectionalShadowRuntime>[0];
}

function object(id: string, patch: Partial<SceneObject> = {}): SceneObject {
  return {
    id,
    name: id,
    primitive: "cube",
    color: "#fff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...patch,
  };
}

function nodeWithCaster() {
  const node = new THREE.Group();
  const mesh = new THREE.Mesh();
  mesh.castShadow = true;
  node.add(mesh);
  return { node, mesh };
}
