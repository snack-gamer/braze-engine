import type { SceneObject } from "../../scene/domain/scene-object";
import type { RootMotionPose } from "../../character/runtime/root-motion";
import { inverseCharacterQuaternion, multiplyCharacterQuaternions, rotateCharacterVector, subtractCharacterVectors } from "../../character/runtime/pose-math";
import type { RigidWorldDescriptor } from "../../physics/runtime/rigid-world-descriptor";
import type { PhysicsVec3 as Vec } from "../../physics/domain/components";
import { createStaticQueryWorld, type StaticSweep } from "../../physics/runtime/queries/static-query-world";
import { normalizeCharacterMovement } from "../domain/character-movement";
import { moveStaticCharacter, type CharacterMovementResult } from "./static-character-movement";
import { characterControllerBackingIssue } from "../application/character-controller-authoring";
import type { RigidBodyDescriptor } from "../../physics/runtime/rigid-world-descriptor";
import type { CharacterMovementSettings } from "../domain/character-movement";

type Character = Readonly<{ body: RigidBodyDescriptor; radius: number; halfLength: number; settings: CharacterMovementSettings }>;
export type RuntimeCharacterMotor = Readonly<{ objectId: string; body: RigidBodyDescriptor; movement?: CharacterMovementSettings }>;
export type PreparedCharacterMovement = Readonly<{ pose: RootMotionPose; commit: () => void }>;

function characterMotor(body: RigidBodyDescriptor, movement?: CharacterMovementSettings): Character {
  if (body.binding.bodyType !== "kinematic" || body.shape.kind !== "capsule" || body.isTrigger) throw new Error("Character Controller requires one solid kinematic capsule.");
  const axis = rotateCharacterVector(body.orientation, [0, 1, 0]);
  if (Math.abs(axis[1]) < 1 - 1e-5) throw new Error(`${body.binding.objectId}: Character Controller requires a world-upright capsule.`);
  return { body, radius: body.shape.radius, halfLength: body.shape.halfLength, settings: normalizeCharacterMovement(movement) };
}

/** Cold compilation of commandable characters; no scans of physics bodies per movement. */
export function createCharacterMotorWorld(objects: readonly SceneObject[], world: RigidWorldDescriptor) {
  const byOwner = new Map<string, typeof world.bodies>();
  for (const body of world.bodies) {
    const entries = byOwner.get(body.binding.objectId) ?? [];
    entries.push(body); byOwner.set(body.binding.objectId, entries);
  }
  const characters = new Map(objects.filter((object) => object.characterController?.enabled).map((object) => {
    const issue = characterControllerBackingIssue(object);
    if (issue) throw new Error(`${object.id}: ${issue}`);
    const bodies = byOwner.get(object.id) ?? [], body = bodies.find((entry) => entry.binding.colliderId === object.characterController!.capsuleColliderId);
    if (!body || body.shape.kind !== "capsule" || bodies.length !== 1) throw new Error(`${object.id}: Character Controller requires exactly one capsule collider.`);
    return [object.id, characterMotor(body, object.characterController!.movement)] as const;
  }));
  const removed = new Set<string>();
  let query = characters.size ? createStaticQueryWorld(world, (id) => !removed.has(id)) : null;
  const results = new Map<string, CharacterMovementResult>();
  let disposed = false;
  function prepareMovement(objectId: string, current: RootMotionPose, target: RootMotionPose): PreparedCharacterMovement {
    const character = characters.get(objectId);
    if (!character || !query || removed.has(objectId)) return { pose: target, commit() {} };
    const staticQuery = query;
    const { binding } = character.body;
    const rotation = multiplyCharacterQuaternions(target.rotation, inverseCharacterQuaternion(binding.objectLocalOrientation));
    if (Math.abs(rotateCharacterVector(rotation, [0, 1, 0])[1]) < 1 - 1e-5) throw new Error(`${objectId}: Character movement supports yaw rotation only.`);
    const center = (pose: RootMotionPose): Vec => [...subtractCharacterVectors(pose.position,
      rotateCharacterVector(multiplyCharacterQuaternions(pose.rotation, inverseCharacterQuaternion(binding.objectLocalOrientation)), binding.objectLocalOffset))];
    const start = center(current), end = center(target);
    const result = moveStaticCharacter({ objectId, position: start, displacement: end.map((v, i) => v - start[i]) as Vec,
      wasGrounded: results.get(objectId)?.grounded,
      radius: character.radius, halfLength: character.halfLength, settings: character.settings,
      cast: (sweep) => staticQuery.capsuleCast({ ...sweep, collisionLayer: character.body.collisionLayer ?? 0, collisionMask: character.body.collisionMask }) });
    return { pose: { rotation: target.rotation, position: target.position.map((v, i) => v + result.position[i] - end[i]) as Vec },
      commit() { results.set(objectId, result); } };
  }
  return {
    stats: () => ({ characters: characters.size, results: results.size, removed: removed.size, staticBodies: query?.bodyCount ?? 0 }),
    has: (objectId: string) => characters.has(objectId) && !removed.has(objectId),
    result: (objectId: string) => removed.has(objectId) ? undefined : results.get(objectId),
    setRemoved(objectId: string, value: boolean) { if (value) removed.add(objectId); else removed.delete(objectId); },
    retire(objectId: string) { if (characters.delete(objectId)) removed.delete(objectId); results.delete(objectId); },
    /** Cold preparation; removed motor/results stay retained until commit retirement. */
    prepareRuntime(created: readonly RuntimeCharacterMotor[], deleted: readonly string[]) {
      if (disposed) throw new Error("Character motor world has ended.");
      const next = new Map(created.map((entry) => [entry.objectId, characterMotor(entry.body, entry.movement)]));
      if (next.size !== created.length || created.some((entry) => characters.has(entry.objectId))) throw new Error("Character motor identity is already registered.");
      const previous = new Map(deleted.map((id) => [id, { character: characters.get(id), removed: removed.has(id) }]));
      if (next.size && !query) query = createStaticQueryWorld(world, (id) => !removed.has(id));
      let published = false, ended = false;
      return {
        publish() {
          if (disposed || ended || published) throw new Error("Character motor transaction is no longer publishable.");
          if ([...next.keys()].some((id) => characters.has(id)) || [...previous].some(([id, old]) => characters.get(id) !== old.character)) throw new Error("Character motors changed after preparation.");
          published = true;
          for (const [id, character] of next) { characters.set(id, character); results.delete(id); removed.delete(id); }
          for (const id of deleted) removed.add(id);
        },
        rollback() {
          if (ended) return; ended = true;
          if (!published) return;
          for (const id of next.keys()) { characters.delete(id); results.delete(id); removed.delete(id); }
          for (const [id, old] of previous) { if (old.removed) removed.add(id); else removed.delete(id); }
        },
        retire() {
          if (ended || !published) return; ended = true;
          for (const id of deleted) { characters.delete(id); results.delete(id); removed.delete(id); }
        },
      };
    },
    prepareMovement,
    sphereCast(sweep: StaticSweep) {
      if (disposed) throw new Error("Character motor world has ended.");
      query ??= createStaticQueryWorld(world, (id) => !removed.has(id));
      return query.sphereCast(sweep);
    },
    constrain(objectId: string, current: RootMotionPose, target: RootMotionPose): RootMotionPose {
      const prepared = prepareMovement(objectId, current, target); prepared.commit(); return prepared.pose;
    },
    dispose() { disposed = true; characters.clear(); removed.clear(); results.clear(); query = null; },
  };
}
