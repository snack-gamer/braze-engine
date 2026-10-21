import { expect, it, vi } from "vitest";
import { createEntityWorld } from "./entity-world";
import { captureEntityTags } from "../domain/entity-tags";
import type { EntityBatch } from "../domain/entity-world";

const created = (batch: EntityBatch) => {
  const state = batch.read(); if (state.status !== "committed") throw Error(JSON.stringify(state)); return state.created.one;
};

it("bounds and freezes tags and rejects malformed or ambiguous identifiers", () => {
  for (const value of [null, "Enemy", [""], ["two words"], ["1tag"], ["A".repeat(49)], ["A", "A"], Array(9).fill("A")]) {
    expect(() => captureEntityTags(value)).toThrow();
  }
  expect(captureEntityTags(undefined)).toEqual([]);
  for (const tag of ["Enemy", "enemy", "team.blue-1"]) expect(captureEntityTags([tag])).toEqual([tag]);
  expect(Object.isFrozen(captureEntityTags(["Enemy"]))).toBe(true);
});

it("indexes authored and runtime entities only at commits, bounds queries and captures inputs", () => {
  const h = createEntityWorld({ authored: [{ id: "hero", name: "Hero", tags: ["Actor"] }] });
  const tags = ["Actor"], ticket = h.port.submit([{ op: "create", key: "one", name: "One", tags }]);
  tags[0] = "Changed"; expect(h.port.queryTag("Actor", 1)).toMatchObject({ total: 1, truncated: false });
  h.flush(1); const handle = created(ticket), snapshot = h.port.queryTag("Actor", 1);
  expect(snapshot).toMatchObject({ total: 2, truncated: true }); expect(snapshot.handles).toHaveLength(1);
  expect(h.port.queryTag("actor", 16).total).toBe(0); expect(h.port.queryTag("Changed", 16).total).toBe(0);
  const retag = h.port.submit([{ op: "setTags", handle, tags: ["Target"] }]);
  expect(h.port.queryTag("Actor", 16).total).toBe(2); h.flush(2);
  expect(retag.read()).toMatchObject({ status: "committed", tick: 2 });
  expect(h.port.queryTag("Actor", 16).total).toBe(1); expect(h.port.queryTag("Target", 16).handles).toEqual([handle]);
  expect(snapshot.total).toBe(2); expect(Object.isFrozen(snapshot.handles)).toBe(true);
  for (const limit of [0, 257, 1.1, NaN]) expect(() => h.port.queryTag("Actor", limit)).toThrow();
  expect(() => h.port.queryTag("bad tag", 1)).toThrow();
  h.port.submit([{ op: "destroy", handle }]); h.flush(3);
  expect(h.port.queryTag("Target", 16).total).toBe(0);
  const stale = h.port.submit([{ op: "setTags", handle, tags: ["Ghost"] }]); h.flush(4);
  expect(stale.read()).toMatchObject({ code: "stale-handle" }); expect(h.port.stats().tagMemberships).toBe(1);
  h.dispose(); expect(h.port.stats()).toMatchObject({ tagKinds: 0, tagMemberships: 0 });
  expect(() => h.port.queryTag("Actor", 1)).toThrow(expect.objectContaining({ code: "world-ended" }));
});

it("keeps metadata atomic on backend failure and never prepares GPU work for a tag-only batch", () => {
  const prepare = vi.fn(() => ({ publish() { throw Error("Controlled publication failure"); }, rollback() {}, retire() {} }));
  const h = createEntityWorld({ authored: [{ id: "hero", name: "Hero", tags: ["Saved"] }], backend: { components: [], prepare, dispose() {} } });
  const handle = h.port.findByAuthoredId("hero")!;
  const failed = h.port.submit([{ op: "setTags", handle, tags: ["Changed"] }, { op: "create", key: "one", name: "One", tags: ["Ghost"] }]);
  h.flush(1); expect(failed.read()).toMatchObject({ code: "backend-failed" });
  expect(h.port.queryTag("Saved", 1).total).toBe(1); expect(h.port.queryTag("Changed", 1).total).toBe(0); expect(h.port.queryTag("Ghost", 1).total).toBe(0);
  prepare.mockClear(); h.port.submit([{ op: "setTags", handle, tags: ["Changed"] }]); h.flush(2);
  expect(prepare).not.toHaveBeenCalled(); expect(h.port.inspect(handle).tags).toEqual(["Changed"]);
  const duplicate = h.port.submit([{ op: "setTags", handle, tags: [] }, { op: "setTags", handle, tags: ["Other"] }]); h.flush(3);
  expect(duplicate.read()).toMatchObject({ code: "invalid-command" }); expect(h.port.inspect(handle).tags).toEqual(["Changed"]); h.dispose();
});

it("excludes retiring entities and rejects cross-world retagging", () => {
  let finish!: () => void;
  const fence = new Promise<void>((resolve) => { finish = resolve; });
  const h = createEntityWorld({ backend: { components: [], prepare: () => ({ publish() {}, rollback() {}, retire: () => fence }), dispose() {} } });
  const ticket = h.port.submit([{ op: "create", key: "one", name: "One", tags: ["Enemy"] }]); h.flush(1); const handle = created(ticket);
  const other = createEntityWorld(); const rejected = other.port.submit([{ op: "setTags", handle, tags: ["Ghost"] }]); other.flush(1);
  expect(rejected.read()).toMatchObject({ code: "stale-handle" });
  h.port.submit([{ op: "destroy", handle }]); h.flush(2);
  expect(h.port.stats().retiring).toBe(1); expect(h.port.queryTag("Enemy", 1).total).toBe(0);
  finish(); h.dispose(); other.dispose();
});
