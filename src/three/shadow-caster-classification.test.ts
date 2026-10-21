import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { SceneObject } from "../types";
import {
  THREE_DYNAMIC_SHADOW_CASTER_LAYER,
  THREE_STATIC_SHADOW_CASTER_LAYER,
} from "../rendering/adapters/three-webgpu/shadows/three-shadow-caster-layers";
import {
  applyAuthoredShadowCasterLayers,
  classifyAuthoredShadowCasters,
} from "./shadow-caster-classification";

describe("authored shadow caster classification", () => {
  it("inherits runtime motion from ancestors and leaves unrelated roots static", () => {
    const animated = object("animated", { animator: { enabled: true } as SceneObject["animator"] });
    const child = object("child", { parentId: animated.id });
    const floor = object("floor");

    const result = classifyAuthoredShadowCasters([animated, child, floor]);

    expect([...result.byObjectId]).toEqual([
      ["animated", "dynamic"],
      ["child", "dynamic"],
      ["floor", "static"],
    ]);
  });

  it("recognizes every runtime transform owner and ignores disabled components", () => {
    const dynamicPatches: Partial<SceneObject>[] = [
      { rigidbody: { enabled: true } as SceneObject["rigidbody"] },
      { characterController: { enabled: true } as SceneObject["characterController"] },
      { animationPlayer: { enabled: true } },
      { motionPulse: { enabled: true, targets: [] } },
      { cloner: { enabled: true } as SceneObject["cloner"] },
      { modifiers: [{ id: "b", type: "buoyancy", name: "B", enabled: true } as never] },
    ];
    const objects = dynamicPatches.map((patch, index) => object(`dynamic-${index}`, patch));
    objects.push(object("disabled", { animationPlayer: { enabled: false } }));

    const result = classifyAuthoredShadowCasters(objects);

    expect(objects.slice(0, -1).every(({ id }) => result.byObjectId.get(id) === "dynamic")).toBe(true);
    expect(result.byObjectId.get("disabled")).toBe("static");
  });

  it("assigns body meshes to one dedicated layer while preserving visible layer zero", () => {
    const staticObject = object("static");
    const dynamicObject = object("dynamic", { animationPlayer: { enabled: true } });
    const staticNode = nodeWithCaster();
    const dynamicNode = nodeWithCaster();
    const classification = classifyAuthoredShadowCasters([staticObject, dynamicObject]);

    applyAuthoredShadowCasterLayers(classification, new Map([
      [staticObject.id, staticNode.node],
      [dynamicObject.id, dynamicNode.node],
    ]));

    expect(staticNode.mesh.layers.isEnabled(0)).toBe(true);
    expect(staticNode.mesh.layers.isEnabled(THREE_STATIC_SHADOW_CASTER_LAYER)).toBe(true);
    expect(staticNode.mesh.layers.isEnabled(THREE_DYNAMIC_SHADOW_CASTER_LAYER)).toBe(false);
    expect(dynamicNode.mesh.layers.isEnabled(0)).toBe(true);
    expect(dynamicNode.mesh.layers.isEnabled(THREE_STATIC_SHADOW_CASTER_LAYER)).toBe(false);
    expect(dynamicNode.mesh.layers.isEnabled(THREE_DYNAMIC_SHADOW_CASTER_LAYER)).toBe(true);
  });
});

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
