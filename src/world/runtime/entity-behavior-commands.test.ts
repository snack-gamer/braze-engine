import { expect, it } from "vitest";
import { createEntityWorld } from "./entity-world";
import { savedBehavior } from "../../behaviors/testing/registered-behavior-fixture";

it("captures immutable saved behavior declarations and bounds caller-owned command data", () => {
  const world = createEntityWorld();
  const values = { speed: 2, target: { entityId: "root" } }, behaviors = savedBehavior("counter", values);
  const ticket = world.port.submit([{ op: "create", key: "root", name: "Root", behaviors }]);
  values.speed = 20; values.target.entityId = "other"; world.flush(1);
  const state = ticket.read(); if (state.status !== "committed") throw Error("No entity");
  const component = world.port.inspect(state.created.root).behaviors!;
  expect(component.entries[0].values).toEqual({ speed: 2, target: { entityId: "root" } });
  expect(Object.isFrozen(component)).toBe(true); expect(Object.isFrozen(component.entries[0].values.target)).toBe(true);
  expect(() => world.port.submit([{ op: "create", key: "bad", name: "Bad", behaviors: {
    version: 1, entries: Array.from({ length: 9 }, (_, index) => savedBehavior(`entry${index}`).entries[0]),
  } }])).toThrow(expect.objectContaining({ code: "invalid-command" }));
  expect(world.port.stats().queuedCommands).toBe(0); world.dispose();
});
