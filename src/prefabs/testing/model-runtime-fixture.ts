import { BoxGeometry, Mesh, MeshStandardMaterial, Scene } from "three";
import { createRuntimeModelBackend } from "../adapters/three/runtime-model-backend";
import { createRuntimeModelAssets } from "../adapters/three/runtime-model-assets";
import { captureRuntimePrefabResourceCatalog } from "../adapters/runtime-prefab-resource-catalog";
import { compileRuntimePrefabLibrary } from "../adapters/runtime-prefab-compiler";
import { createEntityWorld } from "../../world/runtime/entity-world";
import { createRuntimePrefabs } from "../runtime/runtime-prefabs";
import type { RuntimePrefabSource } from "../domain/runtime-prefab";
import type { Runtime } from "../../three/runtime";
import type { PrefabBatch } from "../domain/runtime-prefab";
export const modelAsset = { guid: "b".repeat(32) }, prefabAsset = { guid: "a".repeat(32) };
export function modelSource(): RuntimePrefabSource {
  const node = { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1], visible: true, locked: false, color: "#ffffff" };
  return { asset: prefabAsset, name: "Model", revision: "saved", resources: { models: [{ asset: modelAsset, url: "/3d-models/model.gltf", primitive: "gltf", importSettings: {} }], materials: [] },
    document: { version: "braze/prefab-v1", name: "Model", rootIds: ["root"], objects: [{ ...node, id: "root", name: "Root", primitive: "transform" },
      { ...node, id: "model", name: "Model", primitive: "gltf", assetRef: modelAsset, parentId: "root" }] } };
}
export async function settle() { for (let turn = 0; turn < 40; turn++) await Promise.resolve(); }
export function committed(ticket: PrefabBatch) { const state = ticket.read(); if (state.status !== "committed") throw Error(JSON.stringify(state)); return state.instance; }
export function modelRuntimeFixture(fence: () => Promise<void> = async () => undefined) {
  const source = modelSource(), catalog = captureRuntimePrefabResourceCatalog([source]);
  const resources = createRuntimeModelAssets(catalog);
  let prepared = 0, released = 0;
  const prepare: typeof resources.prepare = async () => {
    prepared++;
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: "orange" }));
    mesh.material.addEventListener("dispose", () => { released++; });
    mesh.userData.originalMaterial = mesh.material;
    return mesh;
  };
  const assets = { ...resources, prepare };
  const service = createRuntimeModelBackend(catalog, () => { throw Error("Unexpected physics binding"); }, fence, assets);
  const world = createEntityWorld({ backend: service.backend });
  const prefabs = createRuntimePrefabs(world.port, compileRuntimePrefabLibrary([source]), world.reservations);
  const view = { scene: new Scene(), disposed: false } as Runtime;
  service.attach(view);
  return { source, service, world, prefabs, view, assets, counts: () => ({ prepared, released }),
    async flush(tick: number) { world.flush(tick); await settle(); world.flush(tick + 1); await settle(); },
    async dispose() { world.dispose(); await settle(); },
  };
}
