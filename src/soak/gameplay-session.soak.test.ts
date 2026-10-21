import { createUiCanvas } from "../game-ui/domain/ui-document";
import { createRuntimePrefabs } from "../prefabs/runtime/runtime-prefabs";
import { expect, it } from "vitest";
import { createGameSession } from "../gameplay/runtime/game-session";
import { createEntityWorld } from "../world/runtime/entity-world";

it("releases callbacks and resources over 1,000 gameplay lifetimes", async () => {
  let activeResources = 0, ticks = 0, delivered = 0, disposals = 0, uiActions = 0;
  const errors: string[] = [];
  for (let run = 0; run < 1_000; run += 1) {
    const world = createEntityWorld();
    const session = createGameSession({ version: 1, create(context) {
      const screen = context.ui.create("hud", { ...createUiCanvas(), root: { id: "root", kind: "panel", children: [{ id: "add", kind: "button", action: "add" }] } });
      screen.on("add", () => { uiActions++; }); screen.tween("root", { opacity: 0 }, { duration: 1, repeat: 100 });
      activeResources += 1;
      context.defer(() => { activeResources -= 1; });
      context.defer(context.events.subscribe("tick", () => { delivered += 1; }));
      return { fixedUpdate() { ticks += 1; context.events.emit({ type: "tick" }); }, dispose() { disposals += 1; } };
    } }, {
      beforeTick: world.flush, report: (diagnostic) => errors.push(diagnostic.code),
      context: () => ({ animation: { snapshot: () => null, setFloat: () => undefined, setInt: () => undefined, setBool: () => undefined, setTrigger: () => undefined, resetTrigger: () => undefined, subscribe: () => () => undefined }, entities: [], world: world.port, prefabs: createRuntimePrefabs(world.port, []), input: {
        action: () => ({ value: 0, held: false, pressed: false, released: false }),
        bindings: () => ({ version: 1, actions: [] }), rebind() {}, requestPointerLock: async () => undefined, releasePointerLock() {}, capturePointerLock: () => () => undefined, pointerLockStatus: () => ({ status: "unlocked" }),
      }, camera: { setPose() {}, snapshot: () => null, acquire: () => { throw Error("unused"); }, constrain: (_target, position) => position },
      characters: { move: () => { throw new Error("unused"); }, snapshot: () => null, acquire: () => { throw Error("unused"); } } }),
    });
    await session.start(); session.ui.setEnabled(true); session.ui.dispatch("hud", "add");
    if (run % 2 === 0) for (let frame = 0; frame < 10; frame += 1) session.advance(1 / 30);
    else for (let index = 1; index <= 20; index += 1) {
      expect(session.fixedTick({ index, deltaSeconds: 1 / 60, elapsedSeconds: index / 60 })).toBe(true);
    }
    session.dispose(); session.dispose(); session.advance(1); world.dispose();
    expect(activeResources).toBe(0); expect(session.ui.stats()).toEqual({ screens: 0, nodes: 0, tweens: 0, events: 0, listeners: 0, observers: 0 });
  }
  expect(uiActions).toBe(1000); expect(ticks).toBe(20_000); expect(delivered).toBe(19_000); expect(disposals).toBe(1_000); expect(errors).toEqual([]);
});
