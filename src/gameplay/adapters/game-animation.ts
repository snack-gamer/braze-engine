import type { AnimatorPlaybackBinding } from "../../character/application/playback/animator-playback-binding";
import type { EntityHandle, EntityWorld } from "../../world/domain/entity-world";
import type { GameAnimation } from "../domain/game-animation";

export type RuntimeAnimationIdentity = Readonly<{
  runtimeAnimatorId: (entity: EntityHandle) => string | undefined;
  runtimeEntity: (id: string) => EntityHandle | undefined;
}>;

/** Binds world animation to generation-checked handles and the game session's abort lifetime. */
export function createGameAnimation(world: EntityWorld, signal: AbortSignal, resolve: () => AnimatorPlaybackBinding | undefined, runtime: () => RuntimeAnimationIdentity | undefined = () => undefined): GameAnimation {
  const active = () => { if (signal.aborted) throw new Error("This gameplay animation session has ended."); };
  const id = (entity: EntityHandle) => {
    active(); const authoredId = world.inspect(entity).authoredId;
    return authoredId ?? runtime()?.runtimeAnimatorId(entity);
  };
  const binding = () => { active(); const value = resolve(); if (!value) throw new Error("The animation world is unavailable."); return value; };
  const command = (entity: EntityHandle, invoke: (target: AnimatorPlaybackBinding, id: string) => { value: void | null; diagnostics: readonly { message: string }[] }) => {
    const objectId = id(entity);
    if (!objectId) throw new Error("This runtime entity has no active Animator.");
    const result = invoke(binding(), objectId);
    if (result.value === null) throw new Error(result.diagnostics.map((item) => item.message).join("; "));
  };
  return Object.freeze({
    snapshot(entity) {
      const objectId = id(entity);
      if (!objectId) return null;
      const state = binding().trace.state(objectId);
      return state ? Object.freeze({ controllerId: state.controllerId, parameters: Object.freeze({ ...state.parameters }),
        layers: Object.freeze(state.layers.map((layer) => Object.freeze({ layerId: layer.layerId, currentStateId: layer.currentStateId, stateTimeSeconds: layer.stateTimeSeconds }))) }) : null;
    },
    setFloat: (entity, name, value) => command(entity, (port, objectId) => port.commands.setFloat(objectId, name, value)),
    setInt: (entity, name, value) => command(entity, (port, objectId) => port.commands.setInt(objectId, name, value)),
    setBool: (entity, name, value) => command(entity, (port, objectId) => port.commands.setBool(objectId, name, value)),
    setTrigger: (entity, name) => command(entity, (port, objectId) => port.commands.setTrigger(objectId, name)),
    resetTrigger: (entity, name) => command(entity, (port, objectId) => port.commands.resetTrigger(objectId, name)),
    subscribe(listener) {
      const result = binding().events.subscribe((event) => {
        if (signal.aborted) return;
        const entity = world.findByAuthoredId(event.characterId) ?? runtime()?.runtimeEntity(event.characterId);
        if (entity && world.isAlive(entity)) listener(Object.freeze({ entity, kind: event.kind, layerId: event.layerId, event: Object.freeze({ ...event.event, payload: Object.freeze({ ...event.event.payload }) }) }));
      });
      if (!result.value) throw new Error(result.diagnostics.map((item) => item.message).join("; "));
      let subscribed = true;
      const unsubscribe = () => { if (!subscribed) return; subscribed = false; result.value!(); signal.removeEventListener("abort", unsubscribe); };
      signal.addEventListener("abort", unsubscribe, { once: true });
      return unsubscribe;
    },
  });
}
