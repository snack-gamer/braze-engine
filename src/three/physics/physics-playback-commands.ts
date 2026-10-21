import { EntityWorldError, type EntityHandle } from "../../world/domain/entity-world";
import type { RigidBodyCommand } from "../../physics/gpu/rigid-body-commands";
import type { PhysicsVec3 } from "../../physics/domain/components";
import type { PhysicsPlaybackState } from "./physics-playback-state";
import type { PhysicsPlaybackMotorBuffer } from "./physics-playback-motor-buffer";
import type { RootMotionPose } from "../../character/runtime/root-motion";
import { movePhysicsCharacter } from "./physics-character-commands";
import type { StaticSweep } from "../../physics/runtime/queries/static-query-world";

type Options = Readonly<{
  state: () => PhysicsPlaybackState | null;
  ready: () => boolean;
  motors: PhysicsPlaybackMotorBuffer;
  onChanged: () => void;
}>;

/** Sparse command ports share the same live physics state and exact entity identity. */
export function createPhysicsPlaybackCommands(options: Options) {
  const currentState = () => {
    const current = options.state();
    if (!current || !options.ready()) throw new Error("Physics is not ready; enter Play Mode and inspect diagnostics.");
    return current;
  };
  const runtimeCharacter = (current: PhysicsPlaybackState, handle: EntityHandle) => {
    const id = current.entities.runtimeCharacterId(handle);
    if (!id) throw new EntityWorldError("stale-handle", "No live runtime Character Controller for this entity handle.");
    return id;
  };
  const snapshot = (current: PhysicsPlaybackState, id: string): (RootMotionPose & { grounded: boolean }) | undefined => {
    const pose = current.kinematicObjectPoses.get(id);
    return current.characters?.has(id) && pose ? { position: [...pose.position], rotation: [...pose.rotation],
      grounded: current.characters.result(id)?.grounded ?? false } : undefined;
  };
  return {
    queueBodyCommand(objectId: string, command: RigidBodyCommand) {
      const current = currentState();
      if (current.characters?.has(objectId)) throw new Error("Use character-move for Character Controllers so collision constraints are preserved.");
      const body = current.bodyBindings.findIndex((binding) => binding.objectId === objectId);
      if (body < 0 || !current.runtime.queueBodyCommand) throw new Error(`No commandable body for ${objectId}.`);
      current.runtime.queueBodyCommand({ ...command, body }); options.onChanged();
    },
    moveCharacter(objectId: string, displacement: PhysicsVec3, yawDegrees?: number) {
      return movePhysicsCharacter(currentState(), objectId, displacement, options.onChanged, yawDegrees);
    },
    moveRuntimeCharacter(handle: EntityHandle, displacement: PhysicsVec3, yawDegrees?: number) {
      const current = currentState();
      return movePhysicsCharacter(current, runtimeCharacter(current, handle), displacement, options.onChanged, yawDegrees);
    },
    sweepStaticSphere(query: StaticSweep) {
      const characters = currentState().characters;
      if (!characters) throw new Error("Static camera queries require a Character Controller world.");
      return characters.sphereCast(query);
    },
    characterMotorFor: options.motors.sinkFor,
    runtimeCharacterMotorFor(handle: EntityHandle) {
      const current = options.state();
      const id = current && options.ready() ? current.entities.runtimeCharacterId(handle) : undefined;
      return id ? options.motors.sinkFor(id) : undefined;
    },
    /** Last commanded object-origin pose; no simulated body state is read back. */
    snapshotCharacter(objectId: string) {
      const current = options.state(); return current && options.ready() ? snapshot(current, objectId) : undefined;
    },
    snapshotRuntimeCharacter(handle: EntityHandle) {
      const current = options.state(), id = current?.entities.runtimeCharacterId(handle);
      return current && id && options.ready() ? snapshot(current, id) : undefined;
    },
    async readEvents() {
      const current = options.state();
      if (!current?.runtime.readEvents) throw new Error("Enter Play Mode before reading physics events.");
      const batch = await current.runtime.readEvents();
      if (options.state() !== current) throw new Error("Physics world ended before events were delivered.");
      return { ...batch, scope: "body-pairs" as const, events: batch.events.map((event) => ({ ...event,
        a: current.bodyBindings[event.a].objectId, b: current.bodyBindings[event.b].objectId,
        aColliderId: current.bodyBindings[event.a].colliderId, bColliderId: current.bodyBindings[event.b].colliderId })) };
    },
  };
}

export type PhysicsPlaybackCommandPorts = ReturnType<typeof createPhysicsPlaybackCommands>;
