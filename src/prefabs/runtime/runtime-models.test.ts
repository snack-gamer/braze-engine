import { expect, it, vi } from "vitest";
import { Mesh, Scene } from "three";
import { committed, modelRuntimeFixture, modelSource, prefabAsset, settle } from "../testing/model-runtime-fixture";
import { compileRuntimePrefabLibrary } from "../adapters/runtime-prefab-compiler";
import type { Runtime } from "../../three/runtime";

it("captures GUIDs and composed model poses, and rejects unsupported or missing saved resources", () => {
  const source = modelSource(), library = compileRuntimePrefabLibrary([source]);
  const command = library[0].create({ position: [3, 5, 7], scale: [2, 2, 2] })[1];
  expect(command).toMatchObject({ model: { asset: { guid: "b".repeat(32) }, worldTransform: { position: [3,5,7], scale: [2,2,2] } } });
  expect(() => compileRuntimePrefabLibrary([{ ...source, resources: undefined }])).toThrow(/catalog/);
  const doc = source.document as { objects: Array<Record<string, unknown>> };
  doc.objects[1].animator = { enabled: true };
  expect(() => compileRuntimePrefabLibrary([source])).toThrow(/Animator dependencies/);
});

it("publishes models atomically, gives each view its own materials, and recreates late views", async () => {
  const h = modelRuntimeFixture(), ticket = h.prefabs.instantiate(prefabAsset);
  h.world.flush(1); expect(ticket.read().status).toBe("preparing"); expect(h.view.scene.children).toHaveLength(0);
  await settle(); h.world.flush(2); const first = committed(ticket);
  const view2 = { scene: new Scene(), disposed: false } as Runtime; h.service.attach(view2);
  const mesh1 = h.view.scene.children[0].children[0] as Mesh, mesh2 = view2.scene.children[0].children[0] as Mesh;
  expect(mesh1.material).not.toBe(mesh2.material); expect(mesh1.geometry).toBe(mesh2.geometry);
  await h.service.detach(h.view); expect(h.prefabs.isAlive(first)).toBe(true);
  h.service.attach(h.view); expect(h.view.scene.children).toHaveLength(1);
  h.prefabs.destroy(first); await h.flush(3); expect(h.view.scene.children).toHaveLength(0); expect(view2.scene.children).toHaveLength(0);
  expect(h.counts()).toEqual({ prepared: 1, released: 1 }); await h.dispose();
});

it("retains pooled model resources through the fence, resets placement and rejects stale instances", async () => {
  let finish!: () => void; let block = true;
  const h = modelRuntimeFixture(() => block ? new Promise<void>((resolve) => { finish = resolve; }) : Promise.resolve());
  const pool = h.prefabs.createPool(prefabAsset, { capacity: 1 }), first = pool.acquire(); await h.flush(1); const a = committed(first);
  pool.release(a); await h.flush(3); expect(pool.stats().available).toBe(0); expect(h.view.scene.children).toHaveLength(0);
  block = false; finish(); await settle(); expect(pool.stats().available).toBe(1);
  const next = pool.acquire({ position: [4, 2, 0] }); await h.flush(5); const b = committed(next);
  expect(b.root.generation).toBeGreaterThan(a.root.generation); expect(pool.isAlive(a)).toBe(false);
  expect(h.view.scene.children[0].position.toArray()).toEqual([4,2,0]); expect(h.counts().prepared).toBe(1);
  pool.release(b); await h.flush(7); pool.dispose(); expect(h.counts().released).toBe(1); await h.dispose();
});

it("cancels deferred loading on Stop and disposes the late model without publishing", async () => {
  const h = modelRuntimeFixture(); const prepare = h.assets.prepare;
  let finish!: () => void;
  h.assets.prepare = async (entity, signal) => { await new Promise<void>((resolve) => { finish = resolve; }); return prepare(entity, signal); };
  const ticket = h.prefabs.instantiate(prefabAsset); h.world.flush(1); h.world.dispose(); finish(); await settle();
  expect(ticket.read()).toMatchObject({ status: "rejected", code: "world-ended" });
  expect(h.view.scene.children).toHaveLength(0); expect(h.counts()).toEqual({ prepared: 1, released: 1 });
});

it("rejects failed asset preparation without leaked entities", async () => {
  const h = modelRuntimeFixture(); h.assets.prepare = async () => { throw Error("Missing texture"); };
  const ticket = h.prefabs.instantiate(prefabAsset); await h.flush(1);
  expect(ticket.read()).toMatchObject({ status: "rejected" }); expect(h.world.port.stats().runtime).toBe(0); expect(h.view.scene.children).toHaveLength(0);
  await h.dispose();
});


it("rolls back model views and logical handles when an attachment fails during publication", async () => {
  const h = modelRuntimeFixture(); vi.spyOn(h.view.scene, "add").mockImplementation(() => { throw Error("attachment failed"); });
  const ticket = h.prefabs.instantiate(prefabAsset); await h.flush(1);
  expect(ticket.read()).toMatchObject({ status: "rejected" }); expect(h.world.port.stats().runtime).toBe(0);
  expect(h.service.diagnostics()).toMatchObject({ active: 0, owned: 0 }); expect(h.counts()).toEqual({ prepared: 1, released: 1 });
  await h.dispose();
});


it("releases quarantined model resources on Stop after a failed GPU retirement", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    let failed = false;
    const h = modelRuntimeFixture(() => failed ? Promise.reject(Error("device lost")) : Promise.resolve());
    const pool = h.prefabs.createPool(prefabAsset, { capacity: 1 }), ticket = pool.acquire(); await h.flush(1);
    failed = true; pool.release(committed(ticket)); await h.flush(3);
    expect(pool.stats().quarantined).toBe(1); expect(h.counts().released).toBe(0);
    await h.dispose(); expect(h.counts()).toEqual({ prepared: 1, released: 1 }); expect(h.service.diagnostics().owned).toBe(0);
  } finally { log.mockRestore(); }
});
