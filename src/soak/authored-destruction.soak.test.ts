import { expect, it } from "vitest";
import { createEntityWorld } from "../world/runtime/entity-world";
import { createEntityBehaviors } from "../behaviors/runtime/entity-behaviors";
import { createPlaySceneLifetime } from "../gameplay/adapters/play-scene-lifetime";

it("reclaims 10,000 authored behavior lifetimes over repeated Play/Stop without retaining tombstones", () => {
  const scene = createPlaySceneLifetime(); let starts = 0, disposals = 0, cleanups = 0;
  const authored = Array.from({ length: 10 }, (_, index) => ({ id: String(index), name: String(index), parentId: index ? "0" : undefined, tags: ["Target"] }));
  const tick = { index: 1, deltaSeconds: 1 / 60, elapsedSeconds: 1 / 60 };
  for (let run = 0; run < 1000; run++) {
    const world = createEntityWorld({ authored, capacity: 10, backend: {
      components: [], supportsAuthoredRemoval: true,
      prepare(plan) { return { ...scene.prepare(plan.removed.map((entity) => entity.authoredId!)), retire() {} }; },
      dispose: scene.clear,
    } });
    const behaviors = createEntityBehaviors({ world: world.port, report(error) { throw Error(error.message); } });
    for (const object of authored) behaviors.port.attach(world.port.findByAuthoredId(object.id)!, {
      name: "Owned", create(scope) { scope.defer(() => { cleanups++; }); return { start() { starts++; }, dispose() { disposals++; } }; },
    });
    behaviors.beginTick(tick);
    world.port.destroy(world.port.findByAuthoredId("0")!); world.flush(2); behaviors.beginTick({ ...tick, index: 2 });
    if (world.port.stats().alive || world.port.stats().tagMemberships || behaviors.port.stats().attached || scene.snapshot().size !== 10) throw Error("Authored lifetime retained");
    behaviors.dispose(); world.dispose();
    if (scene.snapshot().size) throw Error("Presentation tombstones survived Stop");
  }
  expect({ starts, disposals, cleanups }).toEqual({ starts: 10_000, disposals: 10_000, cleanups: 10_000 });
});
