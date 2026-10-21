import { describe, expect, it, vi } from "vitest";
import { createEntityWorld } from "../../world/runtime/entity-world";
import { createAnimatorPlaybackCommandPort } from "../../character/application/playback/animator-playback-commands";
import { createAnimatorPlaybackEventPublisher } from "../../character/application/playback/animator-playback-event-port";
import { createAnimatorIkGoalStore } from "../../character/application/playback/animator-playback-ik";
import { createAnimatorRootMotionStore } from "../../character/application/playback/animator-root-motion-port";
import { characterRuntimeSuccess } from "../../character/runtime/diagnostics";
import { createGameAnimation } from "./game-animation";

function fixture() {
  const world = createEntityWorld({ authored: [{ id: "hero", name: "Hero" }] });
  const abort = new AbortController(), events = createAnimatorPlaybackEventPublisher();
  const setParameter = vi.fn(() => characterRuntimeSuccess(undefined));
  const state = { controllerId: "controller", controllerRevision: "r1", parameters: { speed: 1 }, layers: [{ layerId: "base", currentStateId: "idle", stateTimeSeconds: 0.5, stateInstance: 1, transition: null }] };
  const port = createGameAnimation(world.port, abort.signal, () => ({ commands: createAnimatorPlaybackCommandPort(() => ({ setParameter })), events: events.port,
    ik: createAnimatorIkGoalStore().commands, rootMotion: createAnimatorRootMotionStore().port,
    trace: { state: () => state, controller: () => null, subscribe: () => () => undefined }, diagnostics: () => [],
  }));
  return { world, abort, events, state, port, setParameter, hero: world.port.findByAuthoredId("hero")! };
}
describe("game animation port", () => {
  it("copies telemetry and routes typed commands through a live handle", () => {
    const f = fixture(); const snapshot = f.port.snapshot(f.hero)!;
    expect(snapshot.parameters).not.toBe(f.state.parameters); expect(Object.isFrozen(snapshot.layers[0])).toBe(true);
    f.state.parameters.speed = 9; expect(snapshot.parameters.speed).toBe(1);
    f.port.setFloat(f.hero, "Speed", 3); expect(f.setParameter).toHaveBeenCalledExactlyOnceWith("Speed", 3, "float");
    f.world.dispose();
  });
  it("rejects foreign handles and a retained port after Stop", () => {
    const f = fixture(), foreign = createEntityWorld({ authored: [{ id: "hero", name: "Hero" }] });
    expect(() => f.port.setFloat(foreign.port.findByAuthoredId("hero")!, "Speed", 2)).toThrow();
    f.abort.abort(); expect(() => f.port.snapshot(f.hero)).toThrow("ended");
    expect(() => f.port.setTrigger(f.hero, "Jump")).toThrow("ended"); expect(f.setParameter).not.toHaveBeenCalled();
    f.world.dispose(); foreign.dispose();
  });
  it("delivers each event through an entity handle, copies payloads and removes listeners on abort", () => {
    const f = fixture(), listener = vi.fn(); f.port.subscribe(listener);
    const event = { kind: "state" as const, characterId: "hero", layerId: "base", stateId: "idle", event: { id: "beat", name: "Beat", timeSeconds: 0.5, payload: { value: 1 } } };
    f.events.publish(event); expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]![0].entity).toEqual(f.hero);
    event.event.payload.value = 2; expect(listener.mock.calls[0]![0].event.payload.value).toBe(1);
    f.abort.abort(); f.events.publish(event); expect(listener).toHaveBeenCalledOnce(); f.world.dispose();
  });
  it("addresses a spawned Animator and drops events after its entity is removed", () => {
    const world = createEntityWorld(), events = createAnimatorPlaybackEventPublisher(), abort = new AbortController();
    const ticket = world.port.submit([{ op: "create", key: "actor", name: "Actor" }, { op: "create", key: "plain", name: "Plain" }]);
    world.flush(1);
    const committed = ticket.read(); if (committed.status !== "committed") throw new Error(JSON.stringify(committed));
    const actor = committed.created.actor, plain = committed.created.plain, internalId = "runtime-actor";
    const setParameter = vi.fn(() => characterRuntimeSuccess(undefined));
    const state = { controllerId: "controller", controllerRevision: "r1", parameters: { speed: 1 }, layers: [] };
    const binding = { commands: createAnimatorPlaybackCommandPort((id) => id === internalId ? { setParameter } : undefined), events: events.port,
      ik: createAnimatorIkGoalStore().commands, rootMotion: createAnimatorRootMotionStore().port,
      trace: { state: (id: string) => id === internalId ? state : null, controller: () => null, subscribe: () => () => undefined }, diagnostics: () => [],
    };
    const port = createGameAnimation(world.port, abort.signal, () => binding, () => ({
      runtimeAnimatorId: (handle) => handle.world === actor.world && handle.slot === actor.slot && handle.generation === actor.generation ? internalId : undefined,
      runtimeEntity: (id) => id === internalId ? actor : undefined,
    }));
    expect(port.snapshot(actor)?.parameters).toEqual({ speed: 1 }); expect(port.snapshot(plain)).toBeNull();
    expect(() => port.setFloat(plain, "speed", 2)).toThrow("no active Animator");
    port.setFloat(actor, "speed", 2); expect(setParameter).toHaveBeenCalledExactlyOnceWith("speed", 2, "float");
    const listener = vi.fn(); port.subscribe(listener);
    const event = { kind: "state" as const, characterId: internalId, layerId: "base", stateId: "idle", event: { id: "beat", name: "Beat", timeSeconds: 0.5, payload: {} } };
    events.publish(event); expect(listener.mock.calls[0]![0].entity).toEqual(actor);
    world.port.destroy(actor); world.flush(2);
    expect(() => port.snapshot(actor)).toThrow("stale"); expect(() => port.setFloat(actor, "speed", 4)).toThrow("stale");
    events.publish(event); expect(listener).toHaveBeenCalledOnce();
    abort.abort(); world.dispose();
  });
});
