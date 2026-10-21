import { expect, it, vi } from "vitest";
import { createPlaySceneLifetime } from "./play-scene-lifetime";
import { makeObject } from "../../lib/payload";

it("shares immutable removal snapshots, memoizes presentation and restores exact authored inputs", () => {
  const source = [makeObject("cube", 0, { id: "a" }), makeObject("sphere", 1, { id: "b" })];
  const saved = structuredClone(source), lifetime = createPlaySceneLifetime(), listener = vi.fn();
  const detach = lifetime.subscribe(listener), empty = lifetime.snapshot();
  const change = lifetime.prepare(["a"]);
  expect(lifetime.objects(source)).toBe(source); change.publish();
  const visible = lifetime.objects(source);
  expect(visible.map((object) => object.id)).toEqual(["b"]); expect(lifetime.objects(source)).toBe(visible);
  expect(source).toEqual(saved); expect(empty.size).toBe(0);
  change.rollback(); expect(lifetime.objects(source)).toBe(source);
  lifetime.prepare(["a", "b"]).publish(); expect(lifetime.objects(source)).toEqual([]);
  lifetime.clear(); expect(lifetime.objects(source)).toBe(source); expect(listener).toHaveBeenCalledTimes(4);
  detach(); lifetime.clear(); expect(listener).toHaveBeenCalledTimes(4);
});
