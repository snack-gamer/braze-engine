import { expect, it, vi } from "vitest";
import { gameplayModule } from "./gameplay-module";
import { sceneHasBehaviors } from "../../behaviors/application/scene-has-behaviors";
import { makeObject } from "../../lib/payload";

it("provides stock controls without an entry and captures a merged project registry without calling factories", () => {
  const defaults = gameplayModule(null);
  expect(defaults.behaviors?.map((entry) => entry.id)).toEqual(["braze.control.first-person", "braze.control.third-person", "braze.control.top-down"]);
  expect(defaults.input?.actions.map((action) => action.name)).toEqual(["moveX", "moveZ", "jump", "lookX", "lookY", "lookRateX", "lookRateY"]);
  const create = vi.fn(), createBehavior = vi.fn();
  const module = gameplayModule({ version: 1, create, behaviors: [{ id: "project.example", label: "Example", version: 1, fields: [], create: createBehavior }] });
  expect(module.behaviors).toHaveLength(4); expect(module.create).toBe(create);
  expect(create).not.toHaveBeenCalled(); expect(createBehavior).not.toHaveBeenCalled();
  expect(() => gameplayModule({ version: 1, create, behaviors: [defaults.behaviors![0]] })).toThrow(/duplicate behavior registration/);
});

it("discovers saved behaviors once for immutable authored references", () => {
  const objects = [makeObject("cube", 0)];
  expect(sceneHasBehaviors(objects)).toBe(false);
  const changed = [{ ...objects[0], behaviors: { version: 1 as const, entries: [{ id: "stock", type: "braze.control.top-down", typeVersion: 1, enabled: false, values: {} }] } }];
  expect(sceneHasBehaviors(changed)).toBe(true); expect(sceneHasBehaviors(objects)).toBe(false);
});
