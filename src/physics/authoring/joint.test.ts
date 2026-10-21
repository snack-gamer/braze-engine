import { expect, it } from "vitest";
import { defaultJoint } from "../domain/joint";
import { decodeJoint, encodeJoint } from "../serialization/joint-codec";
import { compileAuthoredPhysicsScene } from "./scene-compiler";
import { compileRigidWorld } from "./rigid-world-compiler";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../domain/world-settings";
import { makeObject } from "../../lib/payload";
import { defaultColliderForObject, defaultRigidbodyForObject } from "./component-defaults";
import { duplicateObjectSubtrees } from "../../scene/authoring/object-tree";
import { createPrefabDocument, instantiatePrefabDocument, updatePrefabLinkedInstances } from "../../lib/prefabs";
import { packRigidBodies } from "../gpu/rigid-body-upload";

function fixture() {
  return ["parent", "child"].map((id, i) => {
    const object = makeObject("cube", i, { id, parentId: i ? "parent" : undefined, position: [0, i ? -2 : 5, 0] });
    object.rigidbody = defaultRigidbodyForObject(object); object.colliders = [defaultColliderForObject(object)];
    object.joint = { ...defaultJoint(), kind: i ? "hinge" : "fixed", connectedObjectId: i ? "parent" : null, axis: [0, 0, 1], limitsEnabled: true };
    return object;
  });
}
it("round trips joints and rejects unknown component versions", () => {
  const source = { ...defaultJoint(), kind: "hinge" as const, connectedObjectId: "anchor", minAngle: -20, maxAngle: 80 };
  expect(decodeJoint(encodeJoint(source))).toEqual(source);
  expect(decodeJoint({ ...source, version: "braze/joint-v99" })).toBeUndefined();
});
it("compiles anchors in body space, adjacency, and missing-target diagnostics", () => {
  const objects = fixture();
  const world = compileRigidWorld(compileAuthoredPhysicsScene(objects, "joints", DEFAULT_PHYSICS_WORLD_SETTINGS));
  expect(world.joints).toHaveLength(2); expect(world.joints![1]).toMatchObject({ a: 1, b: 0, anchorA: [0, 0, 0], anchorB: [0, -2, 0] });
  const packed = packRigidBodies(world), bits = new Uint32Array(packed.properties.buffer);
  expect(bits[19]).toBe(2); expect(bits[28 + 19]).toBe(1);
  objects[1].joint!.connectedObjectId = "missing";
  expect(() => compileRigidWorld(compileAuthoredPhysicsScene(objects, "invalid", DEFAULT_PHYSICS_WORLD_SETTINGS))).toThrow("missing");
});
it("remaps internal joint references on scene duplication and prefab instantiation/reimport", () => {
  const objects = fixture();
  const copy = duplicateObjectSubtrees(objects, ["parent"], { idSuffix: "copy", rootOffset: 2, remapPrefabInstances: true, createObjectId: (i) => `copy-${i}` });
  expect(copy.objects.find((o) => o.id === "copy-1")!.joint!.connectedObjectId).toBe("copy-0");
  const prefab = createPrefabDocument(objects, ["parent"], "Joint assembly")!;
  const asset = { filename: "assembly.braze-prefab.json", name: "Assembly", guid: "a".repeat(32) };
  const instance = instantiatePrefabDocument(prefab, { asset });
  const child = instance.find((o) => o.joint?.kind === "hinge")!, parent = instance.find((o) => o.joint?.kind === "fixed")!;
  expect(child.joint!.connectedObjectId).toBe(parent.id);
  const synced = updatePrefabLinkedInstances(instance, prefab, asset);
  expect(synced.find((o) => o.id === child.id)!.joint!.connectedObjectId).toBe(parent.id);
});
