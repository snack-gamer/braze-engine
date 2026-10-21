import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createLiveTransformChannel } from "../../scene/authoring/live-transform";
import type { ObjectTransformPatch } from "../../scene/authoring/live-transform";
import type { SceneObject } from "../../types";
import type { Runtime } from "../runtime";
import { applyLiveObjectTransform } from "./use-live-transform-sync";

function object(id: string, patch: Partial<SceneObject> = {}): SceneObject {
  return {
    id,
    name: id,
    primitive: "cube",
    visible: true,
    locked: false,
    solo: false,
    color: "#ffffff",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...patch,
  };
}

function runtimeFor(entries: Array<[string, THREE.Group]>) {
  const objectRoot = new THREE.Group();
  for (const [, node] of entries) {
    if (!node.parent) objectRoot.add(node);
  }
  const requestFrame = vi.fn();
  const controls = { target: new THREE.Vector3(), update: vi.fn() };
  const invalidateShadowCasterTransform = vi.fn();
  const runtime = {
    objectRoot,
    objectMap: new Map(entries),
    camera: new THREE.PerspectiveCamera(),
    controls,
    clonersDirty: false,
    labelsDirty: false,
    framesSinceSceneChange: 5,
    requestFrame,
    invalidateShadowCasterTransform,
  } as unknown as Runtime;
  return { controls, invalidateShadowCasterTransform, requestFrame, runtime };
}

describe("live transform synchronization", () => {
  it("publishes ephemeral transforms without retaining state", () => {
    const channel = createLiveTransformChannel();
    const listener = vi.fn();
    const unsubscribe = channel.subscribe(listener);
    const transform: ObjectTransformPatch = {
      position: [1, 2, 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };
    channel.publish("cube", transform);
    unsubscribe();
    channel.publish("cube", transform);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("applies an object preview and wakes an idle viewport", () => {
    const node = new THREE.Group();
    const { invalidateShadowCasterTransform, requestFrame, runtime } = runtimeFor([["cube", node]]);
    applyLiveObjectTransform(runtime, [object("cube")], "", {
      objectId: "cube",
      transform: { position: [4, 5, 6], rotation: [0, 90, 0], scale: [2, 2, 2] },
    });
    expect(node.position.toArray()).toEqual([4, 5, 6]);
    expect(node.scale.toArray()).toEqual([2, 2, 2]);
    expect(runtime.framesSinceSceneChange).toBe(0);
    expect(invalidateShadowCasterTransform).toHaveBeenCalledWith("cube");
    expect(requestFrame).toHaveBeenCalledOnce();
  });

  it("updates the render camera when a camera parent moves", () => {
    const parentNode = new THREE.Group();
    const cameraNode = new THREE.Group();
    parentNode.add(cameraNode);
    cameraNode.position.set(1, 0, 0);
    const { controls, runtime } = runtimeFor([
      ["parent", parentNode],
      ["camera", cameraNode],
    ]);
    const objects = [
      object("parent"),
      object("camera", {
        primitive: "camera",
        parentId: "parent",
        position: [1, 0, 0],
        camera: { target: [1, 0, -1], fov: 52, near: 0.1, far: 100 },
      }),
    ];
    applyLiveObjectTransform(runtime, objects, "camera", {
      objectId: "parent",
      transform: { position: [20, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    });
    expect(runtime.camera.position.toArray()).toEqual([21, 0, 0]);
    expect(controls.target.toArray()).toEqual([21, 0, -1]);
  });

  it("applies a live camera target to both the scene node and render camera", () => {
    const cameraNode = new THREE.Group();
    const { controls, runtime } = runtimeFor([["camera", cameraNode]]);
    const objects = [object("camera", {
      primitive: "camera",
      camera: { target: [0, 0, -5], fov: 52, near: 0.1, far: 100 },
    })];
    applyLiveObjectTransform(runtime, objects, "camera", {
      objectId: "camera",
      transform: {
        position: [2, 0, 0],
        rotation: [0, -90, 0],
        scale: [1, 1, 1],
        cameraTarget: [3, 0, 0],
      },
    });
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraNode.quaternion);
    expect(forward.x).toBeCloseTo(1);
    expect(forward.y).toBeCloseTo(0);
    expect(forward.z).toBeCloseTo(0);
    expect(runtime.camera.position.toArray()).toEqual([2, 0, 0]);
    expect(controls.target.toArray()).toEqual([3, 0, 0]);
  });
});
