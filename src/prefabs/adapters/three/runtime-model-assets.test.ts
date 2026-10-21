import { expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three";
import { loadAndPrepareAsset } from "../../../three/assets";
import { createRuntimeModelAssets } from "./runtime-model-assets";
import { captureRuntimePrefabResourceCatalog } from "../runtime-prefab-resource-catalog";
import { modelSource } from "../../testing/model-runtime-fixture";
import { captureRuntimeModel } from "../../../world/domain/runtime-model";
import type { WorldEntity } from "../../../world/domain/entity-world";
import { disposeObject } from "../../../three/dispose";
vi.mock("../../../three/assets", async (original) => ({ ...await original<typeof import("../../../three/assets")>(), loadAndPrepareAsset: vi.fn() }));
function fixture() {
  const source = modelSource(), catalog = captureRuntimePrefabResourceCatalog([source]);
  const owner = createRuntimeModelAssets(catalog), geometry = new BoxGeometry(), texture = new Texture();
  const material = new MeshStandardMaterial({ map: texture }), mesh = new Mesh(geometry, material), object = new Group(); object.add(mesh);
  mesh.userData.originalMaterial = material;
  vi.mocked(loadAndPrepareAsset).mockResolvedValue({ object, animations: [] });
  const model = captureRuntimeModel({ asset: source.resources!.models[0].asset, bindings: [], castShadows: true, receiveShadows: true,
    worldTransform: { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] } });
  const entity: WorldEntity = { handle: { world: Symbol(), slot: 1, generation: 1 }, name: "Model", components: ["transform", "meshFilter", "meshRenderer"], tags: [], model };
  return { owner, entity, mesh, object, geometry, texture };
}
it("retains shared source geometry/textures while isolating material instances, then releases everything on world disposal", async () => {
  const h = fixture(), signal = new AbortController().signal;
  const geometryDispose = vi.spyOn(h.geometry, "dispose"), textureDispose = vi.spyOn(h.texture, "dispose");
  const first = await h.owner.prepare(h.entity, signal), second = await h.owner.prepare(h.entity, signal);
  expect((first.children[0] as Mesh).material).not.toBe((second.children[0] as Mesh).material);
  expect(h.owner.diagnostics()).toMatchObject({ entries: 1, references: 2 });
  disposeObject(first); expect(geometryDispose).not.toHaveBeenCalled(); expect(h.owner.diagnostics().references).toBe(1);
  disposeObject(second); h.owner.dispose(); await Promise.resolve();
  expect(geometryDispose).toHaveBeenCalledTimes(1); expect(textureDispose).toHaveBeenCalledTimes(1); expect(h.owner.diagnostics().entries).toBe(0);
});
it("failed material slot validation and cancelled loading release their source leases", async () => {
  const h = fixture();
  const bad = { ...h.entity, model: { ...h.entity.model!, bindings: [{ slotKey: "missing", materialId: "mat" }] } };
  await expect(h.owner.prepare(bad, new AbortController().signal)).rejects.toThrow(/slot/); expect(h.owner.diagnostics().references).toBe(0);
  const abort = new AbortController(); abort.abort();
  await expect(h.owner.prepare(h.entity, abort.signal)).rejects.toThrow(/cancelled/); expect(h.owner.diagnostics().references).toBe(0);
  h.owner.dispose();
});
