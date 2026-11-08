import { expect, it, vi } from "vitest";
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, PerspectiveCamera, Scene } from "three";
import type { Runtime } from "../../three/runtime";
import { assignCameraCullingBody, setCameraCullingMask, forgetCameraCulling } from "./camera-culling";
import { buildInstancedBodyGroups } from "../../three/physics/instanced-bodies";
import { createRuntimePrimitiveViews } from "../../three/physics/runtime-primitive-views";
import { PhysicsPoseBuffers } from "../../three/physics/gpu-pose";
import type { PhysicsBodyBinding } from "../../physics/runtime/pose-binding";

const runtime = () => ({ camera: new PerspectiveCamera(), scene: new Scene(), disposed: false, requestFrame: vi.fn() }) as unknown as Runtime;
it("filters each body independently of its parent and keeps renderer shadow bits intact", () => {
  const view = runtime(), parent = new Group(), child = new Group(), parentBody = new Mesh(), childBody = new Mesh();
  parent.add(parentBody, child); child.add(childBody); parentBody.layers.enable(29); childBody.layers.enable(30);
  assignCameraCullingBody(view, parentBody, 0); assignCameraCullingBody(view, childBody, 31);
  setCameraCullingMask(view, 0x80000000);
  expect(parentBody.visible).toBe(false); expect(childBody.visible && child.visible && parent.visible).toBe(true);
  expect(parentBody.layers.isEnabled(29)).toBe(true); expect(childBody.layers.isEnabled(30)).toBe(true);
  setCameraCullingMask(view, 0xffffffff); expect(parentBody.visible).toBe(true);
  forgetCameraCulling(view, parentBody); setCameraCullingMask(view, 0); expect(parentBody.visible).toBe(true); expect(childBody.visible).toBe(false);
});
it("separates authored physics batches by object layer and restores originals", () => {
  const view = runtime(), parent = new Group(), geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  const a = new Mesh(geometry, material), b = new Mesh(geometry, material); parent.add(a, b);
  assignCameraCullingBody(view, a, 0); assignCameraCullingBody(view, b, 31);
  const binding = { objectLocalOffset: [0, 0, 0], objectLocalOrientation: [0, 0, 0, 1] } as unknown as PhysicsBodyBinding;
  const groups = buildInstancedBodyGroups([{ bodyIndex: 0, node: a, binding }, { bodyIndex: 1, node: b, binding }], new PhysicsPoseBuffers(2), parent, view);
  expect(groups.meshes).toHaveLength(2); setCameraCullingMask(view, 1);
  expect(groups.meshes.map((mesh) => mesh.visible)).toEqual([true, false]);
  groups.restore(); setCameraCullingMask(view, 0xffffffff); expect(a.visible && b.visible).toBe(true);
  geometry.dispose(); material.dispose();
});
it("updates reserve-only spawned instances on mask edits and resets reused slots", () => {
  const view = runtime(), views = createRuntimePrimitiveViews(new PhysicsPoseBuffers(2), 0, 2, async () => {});
  const primitive = { shape: { kind: "box" as const, size: [2, 2, 2] as const }, position: [0, 0, 0] as const, mass: 1, color: "#ffffff" };
  views.change(0, primitive, undefined, 31); views.change(1, primitive, undefined, 0); views.present(view);
  const mesh = view.scene.children.find((node) => node.name === "physics.runtime.box") as Mesh;
  const scales = () => Array.from(mesh.geometry.getAttribute("bodyScale").array);
  setCameraCullingMask(view, 1); expect(scales()).toEqual([0, 0, 0, 2, 2, 2]);
  setCameraCullingMask(view, 0x80000000); expect(scales()).toEqual([2, 2, 2, 0, 0, 0]);
  views.change(0, null); views.change(0, primitive, undefined, 0); expect(scales()).toEqual([0, 0, 0, 0, 0, 0]);
  setCameraCullingMask(view, 0xffffffff); expect(scales()).toEqual([2, 2, 2, 2, 2, 2]); views.dispose();
});
