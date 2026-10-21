import type { GameCharacterResult, GameCharacters, GameCharacterTarget, GameCharacterMoveOptions } from "../domain/game-character-commands";
import type { EntityHandle, EntityWorld } from "../../world/domain/entity-world";
import type { RootMotionPose } from "../../character/runtime/root-motion";
import { rotateCharacterVector } from "../../character/runtime/pose-math";
import { createCharacterMovementOwnership } from "../runtime/character-movement-ownership";

type CharacterWorld = Readonly<{
  moveCharacter: (id: string, displacement: [number, number, number], yawDegrees?: number) => GameCharacterResult;
  moveRuntimeCharacter: (handle: EntityHandle, displacement: [number, number, number], yawDegrees?: number) => GameCharacterResult;
  snapshotCharacter: (id: string) => (RootMotionPose & { grounded: boolean }) | undefined;
  snapshotRuntimeCharacter: (handle: EntityHandle) => (RootMotionPose & { grounded: boolean }) | undefined;
}>;
type Options = Readonly<{
  entities: EntityWorld;
  authoredCharacters: ReadonlySet<string>;
  authoredAppliedRootMotion?: ReadonlySet<string>;
  physics: () => CharacterWorld | null;
  signal: AbortSignal;
  inFixedTick: () => boolean;
}>;

/** Gameplay commands own writer leases; physics owns constrained command poses and sparse GPU targets. */
export function createGameCharacterCommands(options: Options) {
  let commands = 0, disposed = false;
  const ownership = createCharacterMovementOwnership(options.entities.isAlive);
  const active = () => { if (disposed || options.signal.aborted) throw new Error("This gameplay session has ended."); };
  const resolve = (target: GameCharacterTarget) => {
    active();
    const handle = typeof target === "string" ? options.entities.findByAuthoredId(target) : target;
    const entity = handle ? options.entities.inspect(handle) : undefined, authored = entity?.authoredId;
    if (!entity?.character && (!authored || !options.authoredCharacters.has(authored))) throw new Error(`No enabled Character Controller for ${authored ?? (typeof target === "string" ? target : "this entity")}.`);
    return entity!;
  };
  const snapshot = (target: GameCharacterTarget) => {
    const entity = resolve(target), physics = options.physics();
    const pose = entity.character ? physics?.snapshotRuntimeCharacter(entity.handle) : physics?.snapshotCharacter(entity.authoredId!);
    if (!pose) return null;
    const forward = rotateCharacterVector(pose.rotation, [0, 0, 1]);
    return Object.freeze({ position: Object.freeze([...pose.position]) as readonly [number, number, number], grounded: pose.grounded,
      yawDegrees: Math.atan2(forward[0], forward[2]) * 180 / Math.PI, scope: "static" as const });
  };
  type Owner = ReturnType<typeof ownership.acquire>;
  const move = (target: GameCharacterTarget, displacement: readonly [number, number, number], settings?: GameCharacterMoveOptions, owner?: Owner): GameCharacterResult => {
    active();
    if (!options.inFixedTick()) throw new Error("Move characters from fixedUpdate or a queued gameplay event.");
    const entity = resolve(target); ownership.assertWriter(entity.handle, owner);
    if (++commands > 128) throw new Error("Gameplay character command budget exceeded (128 per tick).");
    const physics = options.physics();
    if (!physics) throw new Error("The gameplay physics world is unavailable.");
    const result = entity.character
      ? physics.moveRuntimeCharacter(entity.handle, [...displacement], settings?.yawDegrees)
      : physics.moveCharacter(entity.authoredId!, [...displacement], settings?.yawDegrees);
    return Object.freeze({ position: Object.freeze([...result.position]) as readonly [number, number, number], grounded: result.grounded, scope: "static" as const });
  };
  const port: GameCharacters = Object.freeze({ snapshot, move,
    acquire(target, label) {
      const record = resolve(target), animator = record.model?.animator;
      if (animator?.enabled && animator.rootMotion.mode === "applyToObject" || record.authoredId && options.authoredAppliedRootMotion?.has(record.authoredId)) {
        throw new Error("Animator root motion owns character movement; use extractOnly or disabled root motion before acquiring a script movement lease.");
      }
      const entity = Object.freeze({ ...record.handle }), owner = ownership.acquire(entity, label);
      return Object.freeze({ entity,
        snapshot() { active(); ownership.assertWriter(entity, owner); return snapshot(entity); },
        move: (displacement, settings) => move(entity, displacement, settings, owner),
        release: () => ownership.release(owner),
      });
    },
  });
  const dispose = () => {
    if (disposed) return; disposed = true; ownership.dispose(); options.signal.removeEventListener("abort", dispose);
  };
  options.signal.addEventListener("abort", dispose, { once: true });
  return { port, beginTick() { commands = 0; ownership.prune(); }, dispose };
}
