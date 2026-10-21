import { expect, it } from "vitest";
import { createEntityWorld } from "../world/runtime/entity-world";

it("reclaims changing tag names and stale generations across repeated worlds", () => {
  for (let run = 0; run < 30; run++) {
    const h = createEntityWorld({ capacity: 2 });
    for (let cycle = 0; cycle < 100; cycle++) {
      const tag = `Tag${cycle}`, ticket = h.port.submit([{ op: "create", key: "one", name: "One", tags: [tag] }]); h.flush(cycle * 2 + 1);
      const state = ticket.read(); if (state.status !== "committed") throw Error(JSON.stringify(state));
      expect(h.port.queryTag(tag, 1).handles).toEqual([state.created.one]);
      h.port.submit([{ op: "destroy", handle: state.created.one }]); h.flush(cycle * 2 + 2);
      expect(h.port.stats()).toMatchObject({ tagKinds: 0, tagMemberships: 0, allocatedSlots: 1 });
      expect(h.port.queryTag(tag, 1).total).toBe(0);
    }
    h.dispose();
  }
});
