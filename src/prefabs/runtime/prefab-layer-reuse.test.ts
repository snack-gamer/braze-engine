import { expect, it } from "vitest";
import savedDuo from "../../../tests/gameplay/fixtures/runtime-duo.braze-prefab.json";
import { compileRuntimePrefabLibrary } from "../adapters/runtime-prefab-compiler";
import { createRuntimePrefabs } from "./runtime-prefabs";
import { createEntityWorld, type EntityLifecycleBackend } from "../../world/runtime/entity-world";
import { RUNTIME_PRIMITIVE_CAPABILITIES } from "../../world/domain/runtime-primitive";
import type { PrefabBatch } from "../domain/runtime-prefab";

const lease = (ticket: PrefabBatch) => {
  const result = ticket.read();
  if (result.status !== "committed") throw Error(JSON.stringify(result));
  return result.instance;
};

it("keeps each saved node's layer and collider override through two pooled placements", async () => {
  const document = { ...structuredClone(savedDuo), objects: savedDuo.objects.map((object) => ({
    ...structuredClone(object),
    ...(object.id === "root" ? { layer: 8 } : object.id === "box" ? { layer: 31 } : object.id === "sphere" ? { layer: 9 } : {}),
    ...(object.id === "sphere" ? { colliders: object.colliders!.map((collider) => ({ ...collider, collisionLayer: 0, collisionMask: 1 })) } : {}),
  })) };
  const asset = { guid: "e".repeat(32) };
  const templates = compileRuntimePrefabLibrary([{ asset, revision: "layer-fixture", name: "Layer Duo", document }]);
  const backend: EntityLifecycleBackend = { components: RUNTIME_PRIMITIVE_CAPABILITIES,
    prepare() { return { publish() {}, rollback() {}, retire() {} }; }, dispose() {},
  };
  const world = createEntityWorld({ capacity: 4, backend });
  const prefabs = createRuntimePrefabs(world.port, templates, world.reservations), pool = prefabs.createPool(asset, { capacity: 1 });
  const inspectLayers = (instance: ReturnType<typeof lease>) => {
    expect(world.port.inspect(instance.root).layer).toBe(8);
    expect(world.port.inspect(instance.entities.group).layer).toBe(0);
    expect(world.port.inspect(instance.entities.box)).toMatchObject({ layer: 31, primitive: { physics: { collisionLayer: 31 } } });
    expect(world.port.inspect(instance.entities.sphere)).toMatchObject({ layer: 9, primitive: { physics: { collisionLayer: 0, collisionMask: 1 } } });
  };
  try {
    const first = pool.acquire({ position: [0, 2, 0] }); world.flush(1); const a = lease(first); inspectLayers(a);
    const returned = pool.release(a); world.flush(2);
    expect(returned.read().status).toBe("committed");
    for (let turn = 0; turn < 12; turn++) await Promise.resolve();
    expect(world.port.isAlive(a.root)).toBe(false);
    document.objects.find((object) => object.id === "box")!.layer = 2;
    const second = pool.acquire({ position: [3, 5, 0], rotation: [0, 90, 0] }); world.flush(3); const b = lease(second); inspectLayers(b);
    expect(b.root.slot).toBe(a.root.slot); expect(b.root.generation).toBeGreaterThan(a.root.generation);
    expect(b.entities.box.slot).toBe(a.entities.box.slot);
    expect(pool.stats()).toMatchObject({ acquisitions: 2, reuses: 1 });
    pool.release(b); world.flush(4);
    for (let turn = 0; turn < 12; turn++) await Promise.resolve();
    pool.dispose();
    expect(world.port.stats()).toMatchObject({ alive: 0, reserved: 0, dormant: 0 });
  } finally { world.dispose(); }
});
