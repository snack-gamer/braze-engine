import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Runtime } from "../runtime";
import { detachAuthoredChildNodes } from "./apply-scene-reconciliation";

describe("scene node removal", () => {
  it("detaches a surviving authored child before its removed parent is disposed", () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    const child = new THREE.Group();
    const parentBody = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    parent.userData.objectId = "parent";
    child.userData.objectId = "child";
    parentBody.userData.objectId = "parent";
    parent.add(parentBody, child);
    root.add(parent);
    const runtime = {
      objectRoot: root,
      objectMap: new Map([
        ["parent", parent],
        ["child", child],
      ]),
    } as unknown as Runtime;

    detachAuthoredChildNodes(runtime, parent);

    expect(child.parent).toBe(root);
    expect(parentBody.parent).toBe(parent);
  });

  it("detaches the first authored child as a unit without flattening its descendants", () => {
    const root = new THREE.Group();
    const removedParent = new THREE.Group();
    const removedChild = new THREE.Group();
    const survivor = new THREE.Group();
    const survivorChild = new THREE.Group();
    removedParent.userData.objectId = "removed-parent";
    removedChild.userData.objectId = "removed-child";
    survivor.userData.objectId = "survivor";
    survivorChild.userData.objectId = "survivor-child";
    survivor.add(survivorChild);
    removedChild.add(survivor);
    removedParent.add(removedChild);
    root.add(removedParent);
    const runtime = {
      objectRoot: root,
      objectMap: new Map([
        ["removed-parent", removedParent],
        ["removed-child", removedChild],
        ["survivor", survivor],
        ["survivor-child", survivorChild],
      ]),
    } as unknown as Runtime;

    detachAuthoredChildNodes(runtime, removedParent);

    expect(removedChild.parent).toBe(root);
    expect(survivor.parent).toBe(removedChild);
    expect(survivorChild.parent).toBe(survivor);
  });
});
