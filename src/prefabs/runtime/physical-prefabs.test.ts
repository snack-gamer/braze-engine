import { expect, it } from "vitest";
import { prefabRuntimeFixture } from "../testing/prefab-runtime-fixture";
import { compileRuntimePrefabLibrary } from "../adapters/runtime-prefab-compiler";
import document from "../../../tests/gameplay/fixtures/runtime-duo.braze-prefab.json";

it("publishes no portion of a graph when its physical capacity is insufficient", () => {
  const h = prefabRuntimeFixture(1);
  const batch = h.prefabs.instantiate(h.asset); h.world.flush(1);
  expect(batch.read()).toMatchObject({ status: "rejected", code: "capacity" });
  expect(h.world.port.stats()).toMatchObject({ alive: 0, runtime: 0, retiring: 0 });
  expect(h.upload.port.activeCount()).toBe(0);
  const second = h.prefabs.instantiate(h.asset); h.world.flush(2);
  expect(second.read()).toMatchObject({ code: "capacity" }); expect(h.upload.port.activeCount()).toBe(0); h.dispose();
});

it("holds all removed graph slots until GPU retirement, then rejects old handles on reuse", async () => {
  let finish!: () => void; const fence = new Promise<void>((resolve) => { finish = resolve; });
  const h = prefabRuntimeFixture(2, () => fence);
  const first = h.prefabs.instantiate(h.asset); h.world.flush(1); h.upload.upload();
  const result = first.read(); if (result.status !== "committed") throw new Error("Spawn failed");
  expect(h.upload.port.activeCount()).toBe(2); h.prefabs.destroy(result.instance); h.world.flush(2); h.upload.upload();
  expect(h.world.port.stats().retiring).toBe(4);
  const early = h.prefabs.instantiate(h.asset); h.world.flush(3); expect(early.read()).toMatchObject({ code: "capacity" });
  finish(); for (let turn = 0; turn < 8; turn++) await Promise.resolve();
  expect(h.world.port.stats().retiring).toBe(0);
  const replacement = h.prefabs.instantiate(h.asset); h.world.flush(4); expect(replacement.read().status).toBe("committed");
  expect(h.prefabs.isAlive(result.instance)).toBe(false); h.dispose();
});

it("preserves authored collider offsets, automatic mass, damping and collision settings", () => {
  const edited = structuredClone(document);
  Object.assign(edited.objects[2], { rigidbody: { enabled: true, massMode: "automatic", density: 3, useGravity: false, linearDamping: 0.2, angularDamping: 0.4 },
    colliders: [{ id: "offset", shape: "box", center: [0.2, 0, 0], size: [1, 2, 1], friction: 0.3, restitution: 0.7, isTrigger: true, collisionLayer: 4, collisionMask: 16 }] });
  const [template] = compileRuntimePrefabLibrary([{ asset: { guid: "a".repeat(32) }, name: "Duo", revision: "edit", document: edited }]);
  const command = template.create().find((item) => item.op === "create" && item.key === "box");
  if (command?.op !== "create") throw new Error("No box");
  expect(command.primitive!.mass).toBeCloseTo(3 * 2 * 0.55 ** 3);
  expect(command.primitive!.collider!.center[0]).toBeCloseTo(0.11);
  expect(command.primitive!.physics).toEqual({ useGravity: false, linearDamping: 0.2, angularDamping: 0.4, friction: 0.3, restitution: 0.7, isTrigger: true, collisionLayer: 4, collisionMask: 16 });
});
