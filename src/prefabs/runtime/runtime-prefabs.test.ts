import { expect, it } from "vitest";
import { createRuntimePrefabs } from "./runtime-prefabs";
import { compileRuntimePrefabLibrary } from "../adapters/runtime-prefab-compiler";
import document from "../../../tests/gameplay/fixtures/runtime-duo.braze-prefab.json";
import type { PrefabDocument } from "../domain/prefab-document";
const prefabReviewDocument = () => structuredClone(document) as unknown as PrefabDocument;
const PREFAB_REVIEW_GUID = "bf050000000000000000000000000001";
import { createEntityWorld } from "../../world/runtime/entity-world";
import { RUNTIME_PRIMITIVE_CAPABILITIES } from "../../world/domain/runtime-primitive";
import type { PrefabBatch, RuntimePrefabSource } from "../domain/runtime-prefab";

const source = (): RuntimePrefabSource => ({ asset: { guid: PREFAB_REVIEW_GUID }, revision: "saved-1", name: "Duo", document: prefabReviewDocument() });
const backend = { components: RUNTIME_PRIMITIVE_CAPABILITIES, prepare: () => ({ publish() {}, rollback() {}, retire() {} }), dispose() {} };
const instance = (batch: PrefabBatch) => { const result = batch.read(); if (result.status !== "committed") throw new Error(JSON.stringify(result)); return result.instance; };

it("captures saved sources and remaps hierarchy/handles independently for every instance", () => {
  const original = source(), templates = compileRuntimePrefabLibrary([original]);
  (original.document as ReturnType<typeof prefabReviewDocument>).objects[2].color = "#ffffff";
  const world = createEntityWorld({ backend }), prefabs = createRuntimePrefabs(world.port, templates);
  const first = prefabs.instantiate(original.asset, { position: [4, 3, 0], rotation: [0, 90, 0], scale: [2, 2, 2] });
  expect(first.read()).toEqual({ status: "queued" }); world.flush(1);
  const a = instance(first), box = world.port.inspect(a.entities.box);
  expect(box.parent).toBe(a.entities.group); expect(world.port.inspect(a.entities.group).parent).toBe(a.root);
  expect(box.primitive!.position[0]).toBeCloseTo(4); expect(box.primitive!.position[1]).toBeCloseTo(3.4); expect(box.primitive!.position[2]).toBeCloseTo(1.2);
  expect(box.primitive!.color).toBe("#ffb020"); expect(box.primitive!.shape).toEqual({ kind: "box", size: [1.54, 1.54, 1.54] });
  expect(box.transform!.position).toEqual([-0.6, 0, 0]);
  const second = prefabs.instantiate(original.asset); world.flush(2); const b = instance(second);
  expect(b.root).not.toEqual(a.root); expect(world.port.inspect(b.entities.box).parent).toBe(b.entities.group);
  expect(world.port.stats().runtime).toBe(8);
  const partial = world.port.submit([{ op: "destroy", handle: a.root }]); world.flush(3);
  expect(partial.read()).toMatchObject({ status: "rejected", code: "invalid-command" });
  prefabs.destroy(a); world.flush(4); expect(prefabs.isAlive(a)).toBe(false); expect(prefabs.isAlive(b)).toBe(true);
  const replacement = prefabs.instantiate(original.asset); world.flush(5); expect(instance(replacement).root).not.toEqual(a.root);
  expect(() => prefabs.destroy(a)).toThrow(/stale/);
  expect(() => prefabs.destroy({ ...b })).toThrow(/stale/);
  world.dispose(); expect(prefabs.isAlive(b)).toBe(false); expect(() => prefabs.instantiate(original.asset)).toThrow(/ended/);
});

it("rejects capacity and missing assets atomically, and Stop cancels queued graphs", () => {
  const templates = compileRuntimePrefabLibrary([source()]), world = createEntityWorld({ backend, capacity: 3 });
  const prefabs = createRuntimePrefabs(world.port, templates);
  const ticket = prefabs.instantiate(source().asset); world.flush(1);
  expect(ticket.read()).toMatchObject({ status: "rejected", code: "capacity" }); expect(world.port.stats().alive).toBe(0);
  expect(() => prefabs.instantiate({ guid: "f".repeat(32) })).toThrow(/snapshot/);
  const queued = prefabs.instantiate(source().asset); world.dispose(); expect(queued.read()).toMatchObject({ status: "rejected", code: "world-ended" });
});

it("rejects unsupported components, broken graphs and unsupported transform combinations before publication", () => {
  for (const mutate of [
    (doc: ReturnType<typeof prefabReviewDocument>) => { Object.assign(doc.objects[2], { animator: { enabled: true } }); },
    (doc: ReturnType<typeof prefabReviewDocument>) => { doc.objects[1].parentId = "box"; },
    (doc: ReturnType<typeof prefabReviewDocument>) => { doc.objects[2].parentId = "missing"; },
    (doc: ReturnType<typeof prefabReviewDocument>) => { doc.objects[1].parentId = "group"; },
    (doc: ReturnType<typeof prefabReviewDocument>) => { doc.objects[3].scale = [1, 2, 1]; },
  ]) {
    const doc = prefabReviewDocument(); mutate(doc); expect(() => compileRuntimePrefabLibrary([{ ...source(), document: doc }])).toThrow();
  }
});
