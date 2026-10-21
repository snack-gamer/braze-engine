import { expect, it, vi } from "vitest";
import { BoxGeometry, Mesh, MeshStandardMaterial, Scene } from "three";
import { captureRuntimeModel } from "../../../world/domain/runtime-model";
import { captureRuntimePrimitive } from "../../../world/domain/runtime-primitive";
import type { Runtime } from "../../../three/runtime";
import { disposeObject } from "../../../three/dispose";
import type { RuntimeModelAnimation } from "./runtime-model-animation";
import { createRuntimeModelViews, type RuntimeModelRecord } from "./runtime-model-views";

it("unregisters animation immediately so a view can reattach while its old GPU resources await retirement", async () => {
  let finishRetirement!: () => void;
  const fence = new Promise<void>((resolve) => { finishRetirement = resolve; });
  const invalidateShadowCasterMaterials = vi.fn();
  const source = new Mesh(new BoxGeometry(), new MeshStandardMaterial()), runtime = { scene: new Scene(), disposed: false, invalidateShadowCasterMaterials } as unknown as Runtime;
  source.userData.originalMaterial = source.material;
  const record: RuntimeModelRecord = { object: source, animationId: "runtime-skin", entity: {
    handle: { world: Symbol(), slot: 1, generation: 1 }, name: "Skin", components: [], tags: [],
    model: captureRuntimeModel({ asset: { guid: "a".repeat(32) }, bindings: [], castShadows: true, receiveShadows: true,
      worldTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
    primitive: captureRuntimePrimitive({ shape: { kind: "box", size: [1, 1, 1] }, position: [0, 0, 0], mass: 1, color: "#ffffff" }),
  } };
  const registered = new Set<Runtime>(), detaches: ReturnType<typeof vi.fn>[] = [], restores: ReturnType<typeof vi.fn>[] = [];
  const animation: RuntimeModelAnimation = { prepare: async () => undefined, dispose() {}, attach(_record, view) {
    if (registered.has(view)) throw new Error("Duplicate animation view registration");
    registered.add(view);
    const detach = vi.fn(() => registered.delete(view)); detaches.push(detach); return detach;
  } };
  const views = createRuntimeModelViews(() => { const restore = vi.fn(); restores.push(restore); return restore; }, () => fence, animation);
  try {
    views.attach(runtime, [record]);
    const firstNode = runtime.scene.children[0], firstMaterial = (firstNode.children[0] as Mesh).material as MeshStandardMaterial;
    const firstDisposal = vi.spyOn(firstMaterial, "dispose");
    const retirement = views.detach(runtime);
    expect(runtime.scene.children).toHaveLength(0); expect(registered.has(runtime)).toBe(false);
    expect(invalidateShadowCasterMaterials).toHaveBeenCalledOnce();
    expect(detaches[0]).toHaveBeenCalledOnce(); expect(firstDisposal).not.toHaveBeenCalled(); expect(restores[0]).not.toHaveBeenCalled();

    views.attach(runtime, [record]);
    const secondNode = runtime.scene.children[0], secondMaterial = (secondNode.children[0] as Mesh).material as MeshStandardMaterial;
    const secondDisposal = vi.spyOn(secondMaterial, "dispose");
    expect(secondNode).not.toBe(firstNode); expect(registered.has(runtime)).toBe(true); expect(detaches).toHaveLength(2);
    expect(firstDisposal).not.toHaveBeenCalled(); expect(secondDisposal).not.toHaveBeenCalled();
    finishRetirement(); await retirement;
    expect(firstDisposal).toHaveBeenCalledOnce(); expect(restores[0]).toHaveBeenCalledOnce();
    expect(secondDisposal).not.toHaveBeenCalled(); expect(restores[1]).not.toHaveBeenCalled();
    expect(detaches[0]).toHaveBeenCalledOnce(); expect(detaches[1]).not.toHaveBeenCalled();
    expect(runtime.scene.children).toEqual([secondNode]); expect(registered.has(runtime)).toBe(true);

    await views.dispose();
    expect(invalidateShadowCasterMaterials).toHaveBeenCalledTimes(2);
    expect(detaches[1]).toHaveBeenCalledOnce(); expect(restores[1]).toHaveBeenCalledOnce(); expect(secondDisposal).toHaveBeenCalledOnce();
    expect(registered.size).toBe(0); expect(runtime.scene.children).toHaveLength(0);
  } finally { finishRetirement(); await views.dispose(); disposeObject(source); }
});

it("retires every view even when an animation detach callback throws", async () => {
  let finishRetirement!: () => void;
  const fence = new Promise<void>((resolve) => { finishRetirement = resolve; });
  const invalidateShadowCasterMaterials = vi.fn();
  const source = new Mesh(new BoxGeometry(), new MeshStandardMaterial()), runtime = { scene: new Scene(), disposed: false, invalidateShadowCasterMaterials } as unknown as Runtime;
  source.userData.originalMaterial = source.material;
  const record: RuntimeModelRecord = { object: source, entity: { handle: { world: Symbol(), slot: 0, generation: 1 }, name: "Skin", components: [], tags: [],
    model: captureRuntimeModel({ asset: { guid: "a".repeat(32) }, bindings: [], castShadows: true, receiveShadows: true,
      worldTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }) } };
  const detach = vi.fn(() => { throw new Error("Detach failed"); });
  const animation: RuntimeModelAnimation = { prepare: async () => undefined, dispose() {}, attach: () => detach };
  const views = createRuntimeModelViews(() => () => {}, () => fence, animation);
  views.attach(runtime, [record]);
  const material = (runtime.scene.children[0].children[0] as Mesh).material as MeshStandardMaterial;
  const disposed = vi.spyOn(material, "dispose");
  const retirement = views.detach(runtime);
  const rejected = expect(retirement).rejects.toThrow("Detach failed");
  expect(runtime.scene.children).toHaveLength(0); expect(detach).toHaveBeenCalledOnce(); expect(disposed).not.toHaveBeenCalled();
  expect(invalidateShadowCasterMaterials).toHaveBeenCalledOnce();
  finishRetirement(); await rejected;
  expect(disposed).toHaveBeenCalledOnce(); expect(detach).toHaveBeenCalledOnce();
  await views.dispose(); disposeObject(source);
});

it("evicts released runtime model shadows immediately and batches final view eviction", async () => {
  const source = new Mesh(new BoxGeometry(), new MeshStandardMaterial()); source.userData.originalMaterial = source.material;
  const runtime = { scene: new Scene(), disposed: false } as Runtime;
  const childCounts: number[] = [];
  const invalidate = vi.fn(() => childCounts.push(runtime.scene.children.length));
  runtime.invalidateShadowCasterMaterials = invalidate;
  const record = (slot: number): RuntimeModelRecord => ({ object: source, entity: {
    handle: { world: Symbol(), slot, generation: 1 }, name: "Model", components: [], tags: [],
    model: captureRuntimeModel({ asset: { guid: "a".repeat(32) }, bindings: [], castShadows: true, receiveShadows: true,
      worldTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
  } });
  const first = record(0), second = record(1), third = record(2);
  const views = createRuntimeModelViews(() => () => {}, () => Promise.resolve());
  views.attach(runtime, [first, second, third]);
  expect(runtime.scene.children).toHaveLength(3);
  views.release(first);
  expect(childCounts).toEqual([2]);
  views.release(first);
  expect(invalidate).toHaveBeenCalledOnce();
  await views.dispose();
  expect(childCounts).toEqual([2, 0]);
  await views.dispose();
  expect(invalidate).toHaveBeenCalledTimes(2);
  disposeObject(source);
});
