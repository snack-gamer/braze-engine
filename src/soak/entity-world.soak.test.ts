import { expect, it } from "vitest";
import { createEntityWorld } from "../world/runtime/entity-world";
import type { EntityHandle } from "../world/domain/entity-world";

it("reuses bounded slots through 100,000 create/remove cycles across 1,000 worlds", () => {
  let previous: EntityHandle | undefined;
  for (let run = 0; run < 1000; run++) {
    const world = createEntityWorld({ capacity: 1 });
    for (let cycle = 0; cycle < 100; cycle++) {
      const receipt = world.port.submit([{ op: "create", key: "item", name: "Item" }]); world.flush(cycle * 2 + 1);
      const state = receipt.read(); if (state.status !== "committed") throw new Error("Creation failed");
      if (previous) expect(world.port.isAlive(previous)).toBe(false);
      previous = state.created.item;
      world.port.submit([{ op: "destroy", handle: previous }]); world.flush(cycle * 2 + 2);
      expect(world.port.stats()).toMatchObject({ alive: 0, allocatedSlots: 1, retiring: 0, queuedCommands: 0 });
    }
    world.dispose(); expect(world.port.isAlive(previous!)).toBe(false);
  }
});
