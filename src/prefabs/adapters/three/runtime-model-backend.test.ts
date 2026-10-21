import { expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene, Texture } from "three";
import { loadAndPrepareAsset } from "../../../three/assets";
import type { Runtime } from "../../../three/runtime";
import { captureRuntimeModel } from "../../../world/domain/runtime-model";
import type { WorldEntity } from "../../../world/domain/entity-world";
import { modelSource } from "../../testing/model-runtime-fixture";
import { captureRuntimePrefabResourceCatalog } from "../runtime-prefab-resource-catalog";
import { createRuntimeModelAssets } from "./runtime-model-assets";
import { createRuntimeModelBackend } from "./runtime-model-backend";
import type { RuntimeModelAnimation } from "./runtime-model-animation";

vi.mock("../../../three/assets", async (original) => ({ ...await original<typeof import("../../../three/assets")>(), loadAndPrepareAsset: vi.fn() }));

it("an animation disposal failure still unregisters views and releases model/source resources after their GPU fence", async () => {
  let finishRetirement!: () => void;
  const fence = new Promise<void>((resolve) => { finishRetirement = resolve; });
  const source = modelSource(), catalog = captureRuntimePrefabResourceCatalog([source]), assets = createRuntimeModelAssets(catalog);
  const geometry = new BoxGeometry(), texture = new Texture(), material = new MeshStandardMaterial({ map: texture }), object = new Group();
  const mesh = new Mesh(geometry, material); mesh.userData.originalMaterial = material; object.add(mesh);
  vi.mocked(loadAndPrepareAsset).mockResolvedValue({ object, animations: [] });
  const geometryDisposal = vi.spyOn(geometry, "dispose"), textureDisposal = vi.spyOn(texture, "dispose"), sourceMaterialDisposal = vi.spyOn(material, "dispose");
  const assetsDisposal = vi.spyOn(assets, "dispose"), detachAnimation = vi.fn();
  const animation: RuntimeModelAnimation = { prepare: async () => undefined, attach: () => detachAnimation,
    dispose: vi.fn(() => { throw new Error("Animator cleanup failed"); }) };
  const service = createRuntimeModelBackend(catalog, () => { throw Error("Unexpected physical model"); }, () => fence, assets, animation);
  const runtime = { scene: new Scene(), disposed: false } as Runtime;
  const entity: WorldEntity = { handle: { world: Symbol(), slot: 1, generation: 1 }, name: "Model", components: ["transform", "meshFilter", "meshRenderer"], tags: [],
    model: captureRuntimeModel({ asset: source.resources!.models[0].asset, bindings: [], castShadows: true, receiveShadows: true,
      worldTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }) };
  service.attach(runtime);
  const change = await service.backend.prepare({ created: [{ key: "model", entity }], removed: [] }, new AbortController().signal);
  change.publish();
  const viewMaterial = ((runtime.scene.children[0].children[0] as Group).children[0] as Mesh).material as MeshStandardMaterial;
  const viewMaterialDisposal = vi.spyOn(viewMaterial, "dispose");
  expect(assets.diagnostics()).toMatchObject({ entries: 1, references: 1 });
  const disposal = service.backend.dispose();
  const failedDisposal = expect(disposal).rejects.toThrow(/Runtime model world cleanup failed:.*Animator cleanup failed/);
  expect(animation.dispose).toHaveBeenCalledOnce(); expect(detachAnimation).toHaveBeenCalledOnce(); expect(runtime.scene.children).toHaveLength(0);
  expect(viewMaterialDisposal).not.toHaveBeenCalled(); expect(geometryDisposal).not.toHaveBeenCalled(); expect(textureDisposal).not.toHaveBeenCalled();
  expect(assetsDisposal).not.toHaveBeenCalled(); expect(assets.diagnostics().references).toBe(1);
  finishRetirement(); await failedDisposal;
  expect(viewMaterialDisposal).toHaveBeenCalledOnce(); expect(geometryDisposal).toHaveBeenCalledOnce();
  expect(textureDisposal).toHaveBeenCalledOnce(); expect(sourceMaterialDisposal).toHaveBeenCalledOnce(); expect(assetsDisposal).toHaveBeenCalledOnce();
  expect(service.diagnostics()).toMatchObject({ active: 0, dormant: 0, owned: 0 }); expect(assets.diagnostics()).toMatchObject({ entries: 0, references: 0 });
  await service.backend.dispose(); expect(animation.dispose).toHaveBeenCalledOnce(); expect(assetsDisposal).toHaveBeenCalledOnce();
});

it("cancelled animation preparation releases prepared models even when Animator rollback fails", async () => {
  const source = modelSource(), catalog = captureRuntimePrefabResourceCatalog([source]), assets = createRuntimeModelAssets(catalog);
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial(), object = new Group();
  const mesh = new Mesh(geometry, material); mesh.userData.originalMaterial = material; object.add(mesh);
  vi.mocked(loadAndPrepareAsset).mockResolvedValue({ object, animations: [] });
  const geometryDisposal = vi.spyOn(geometry, "dispose");
  let reachedPreparation!: () => void, finishPreparation!: () => void;
  const reached = new Promise<void>((resolve) => { reachedPreparation = resolve; });
  const blocked = new Promise<void>((resolve) => { finishPreparation = resolve; });
  const rollback = vi.fn(() => { throw new Error("Animator rollback failed"); });
  const animation: RuntimeModelAnimation = { async prepare() { reachedPreparation(); await blocked; return { publish() {}, rollback, retire() {} }; }, attach: () => undefined, dispose() {} };
  const service = createRuntimeModelBackend(catalog, () => () => {}, async () => {}, assets, animation);
  const entity: WorldEntity = { handle: { world: Symbol(), slot: 1, generation: 1 }, name: "Model", components: ["transform", "meshFilter", "meshRenderer"], tags: [],
    model: captureRuntimeModel({ asset: source.resources!.models[0].asset, bindings: [], castShadows: true, receiveShadows: true,
      worldTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }) };
  const abort = new AbortController();
  const preparation = service.backend.prepare({ created: [{ key: "model", entity }], removed: [] }, abort.signal);
  const rejected = expect(preparation).rejects.toMatchObject({ code: "world-ended", message: expect.stringContaining("Animator rollback failed") });
  await reached; abort.abort(); finishPreparation(); await rejected;
  expect(rollback).toHaveBeenCalledOnce(); expect(geometryDisposal).not.toHaveBeenCalled();
  expect(service.diagnostics()).toMatchObject({ active: 0, dormant: 0, owned: 0 }); expect(assets.diagnostics()).toMatchObject({ entries: 1, references: 0 });
  await service.backend.dispose(); expect(geometryDisposal).toHaveBeenCalledOnce(); expect(assets.diagnostics()).toMatchObject({ entries: 0, references: 0 });
});
