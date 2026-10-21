import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { Runtime } from "../runtime";
import type { PhysicsBodyBinding } from "../../physics/runtime/pose-binding";
import { emitRuntimeBodyLifecycle } from "../reconciliation/body-lifecycle";
import { PhysicsPoseBuffers } from "./gpu-pose";
import { createPhysicsPoseViews } from "./physics-pose-views";

const binding: PhysicsBodyBinding = {
  objectId: "body", colliderId: "box", objectLocalOffset: [0, 0, 0], objectLocalOrientation: [0, 0, 0, 1],
  writesObjectPose: true, interpolation: "none", bodyType: "dynamic", objectPosition: [0, 0, 0], objectOrientation: [0, 0, 0, 1],
};

function viewport() {
  const source = new THREE.MeshStandardMaterial(), node = new THREE.Group();
  // Imported/compound meshes cannot take the parametric instancing path.
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), source); node.add(mesh);
  const scene = new THREE.Scene(), objectRoot = new THREE.Group(); scene.add(objectRoot); objectRoot.add(node);
  const materialAtInvalidation: THREE.Material[] = [];
  const invalidateShadowCasterMaterials = vi.fn(() => { materialAtInvalidation.push(mesh.material); });
  const runtime = {
    disposed: false, pendingAssetLoads: new Set(), objectMap: new Map([["body", node]]), scene, objectRoot,
    framesSinceSceneChange: 0, requestFrame: vi.fn(), invalidateShadowCasterMaterials,
  } as unknown as Runtime;
  return { runtime, node, mesh, source, invalidateShadowCasterMaterials, materialAtInvalidation };
}

describe("physics pose view shadow ownership", () => {
  it("invalidates shadow shaders after cold bind and synchronous restore, but never for pose revisions", () => {
    const view = viewport(), poses = new PhysicsPoseBuffers(1), views = createPhysicsPoseViews([binding], poses, []);
    expect(views.present(view.runtime, 1)).toBe(true);
    const poseMaterial = view.mesh.material;
    expect(poseMaterial).not.toBe(view.source);
    expect(view.materialAtInvalidation).toEqual([poseMaterial]);
    views.present(view.runtime, 2); views.present(view.runtime, 2);
    expect(view.invalidateShadowCasterMaterials).toHaveBeenCalledOnce();
    views.detach(view.runtime);
    expect(view.mesh.material).toBe(view.source);
    expect(view.materialAtInvalidation).toEqual([poseMaterial, view.source]);
    views.detach(view.runtime); views.dispose();
    expect(view.invalidateShadowCasterMaterials).toHaveBeenCalledTimes(2);
  });

  it("keeps Scene and Game cache invalidation independent across detach, rebind and Stop", () => {
    const scene = viewport(), game = viewport(), views = createPhysicsPoseViews([binding], new PhysicsPoseBuffers(1), []);
    views.present(scene.runtime, 1); views.present(game.runtime, 1);
    const gamePose = game.mesh.material;
    views.detach(scene.runtime);
    expect(game.mesh.material).toBe(gamePose);
    expect(game.invalidateShadowCasterMaterials).toHaveBeenCalledOnce();
    views.present(scene.runtime, 2);
    expect(scene.invalidateShadowCasterMaterials).toHaveBeenCalledTimes(3);
    views.dispose();
    expect(scene.mesh.material).toBe(scene.source); expect(game.mesh.material).toBe(game.source);
    expect(scene.invalidateShadowCasterMaterials).toHaveBeenCalledTimes(4);
    expect(game.invalidateShadowCasterMaterials).toHaveBeenCalledTimes(2);
  });

  it("evicts pose shadows before authored body reconciliation replaces the mesh", () => {
    const view = viewport(), views = createPhysicsPoseViews([binding], new PhysicsPoseBuffers(1), []);
    views.present(view.runtime, 1);
    emitRuntimeBodyLifecycle(view.runtime, {
      phase: "willChange", objectId: "body", node: view.node, previousBody: view.mesh, nextBody: null, nextKind: "removed",
    });
    expect(view.materialAtInvalidation[view.materialAtInvalidation.length - 1]).toBe(view.source);
    expect(view.invalidateShadowCasterMaterials).toHaveBeenCalledTimes(2);
    views.dispose();
    expect(view.invalidateShadowCasterMaterials).toHaveBeenCalledTimes(2);
  });
});
