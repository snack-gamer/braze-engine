import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { SceneObject } from "../types";
import { createNode, findBody, syncNode } from "./reconcile";
import type { Runtime } from "./runtime";

function object(id: string, patch: Partial<SceneObject> = {}): SceneObject {
  return {
    id,
    name: id,
    primitive: "transform",
    color: "#ffffff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...patch,
  };
}

describe("hierarchical scene node reconciliation", () => {
  it("never mistakes an authored child node for its parent's render body", () => {
    const parentObject = object("parent");
    const childObject = object("child", { parentId: "parent", primitive: "cube" });
    const parentNode = createNode(parentObject);
    const childNode = createNode(childObject);
    const objectRoot = new THREE.Group();
    objectRoot.add(parentNode);
    parentNode.add(childNode);
    const runtime = {
      objectRoot,
      objectMap: new Map([
        [parentObject.id, parentNode],
        [childObject.id, childNode],
      ]),
      motionMixers: new Map(),
      editorPosePreviewObjectIds: new Set(),
      pendingAssetLoads: new Set(),
      failedAssetLoads: new Map(),
      framesSinceSceneChange: 3,
      requestFrame: vi.fn(),
    } as unknown as Runtime;

    syncNode(runtime, parentNode, parentObject, true, null);
    syncNode(runtime, parentNode, { ...parentObject, primitive: "cube" }, true, null);

    expect(childNode.parent).toBe(parentNode);
    expect(findBody(parentNode)).not.toBe(childNode);
    expect((findBody(parentNode) as THREE.Mesh).isMesh).toBe(true);
  });
});
