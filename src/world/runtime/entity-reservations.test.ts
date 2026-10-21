import { expect, it } from "vitest";
import { createEntityWorld } from "./entity-world";
import type { EntityBatch } from "../domain/entity-world";
const handle = (batch: EntityBatch) => { const result = batch.read(); if (result.status !== "committed") throw Error(JSON.stringify(result)); return result.created.x; };
const create = [{ op: "create" as const, key: "x", name: "X" }];

it("returns reserved slots after failed reuse publication and protects queued reservations from disposal", () => {
  let fail = false;
  const world = createEntityWorld({ capacity: 1, backend: { components: [], prepare: () => ({ publish() { if (fail) throw Error("publish failed"); }, rollback() {}, retire() {} }), dispose() {} } });
  const group = world.reservations.allocate(1), bindings = new Map([["x", group.tokens[0]]]);
  const first = group.submit(create, bindings); expect(() => group.dispose()).toThrow(/pending/);
  world.flush(1); group.submit([{ op: "destroy", handle: handle(first) }]); world.flush(2);
  expect(group.state(group.tokens[0])).toBe("idle"); fail = true;
  const rejected = group.submit(create, bindings); world.flush(3); expect(rejected.read()).toMatchObject({ code: "backend-failed" });
  expect(group.state(group.tokens[0])).toBe("idle"); fail = false;
  const next = group.submit(create, bindings); world.flush(4); expect(handle(next).generation).toBe(3);
  group.submit([{ op: "destroy", handle: handle(next) }]); world.flush(5); group.dispose();
  const normal = world.port.submit(create); world.flush(6); expect(handle(normal).slot).toBe(0); world.dispose();
});

it("bounds aggregate reservations and isolates group tokens", () => {
  const world = createEntityWorld(), first = world.reservations.allocate(4096);
  expect(() => world.reservations.allocate(1)).toThrow(/4096/); first.dispose();
  const a = world.reservations.allocate(1), b = world.reservations.allocate(1);
  expect(() => a.submit(create, new Map([["x", b.tokens[0]]]))).toThrow(/Foreign/);
  world.dispose(); a.dispose(); b.dispose();
});
