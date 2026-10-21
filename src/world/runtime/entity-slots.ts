import type { ReservationState } from "./entity-reservations";
import { EntityWorldError, type EntityHandle, type WorldEntity } from "../domain/entity-world";
import { EMPTY_ENTITY_TAGS } from "../domain/entity-tags";
import { createEntityTagIndex } from "./entity-tag-index";

/** Sparse metadata is cold. Identity checks touch one numeric slot, never scan the world. */
export function createEntitySlots(capacity: number) {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1_000_000) {
    throw new EntityWorldError("capacity", "Entity capacity must be between 1 and 1,000,000.");
  }
  const world = Symbol("entity-world"), generations = new Uint32Array(capacity), states = new Uint8Array(capacity);
  const records = new Map<number, WorldEntity>(), authored = new Map<string, EntityHandle>(), free: number[] = [];
  const reservationSlots = new Map<symbol, number>(), owners = new Map<number, symbol>(), reused = new Set<number>();
  const children = new Map<number, Map<number, EntityHandle>>();
  const tags = createEntityTagIndex();
  let dormant = 0, allocatedSlots = 0, alive = 0, runtime = 0, retiring = 0, quarantined = 0, ended = false;
  const active = () => { if (ended) throw new EntityWorldError("world-ended", "This entity world has ended."); };
  const matches = (handle: EntityHandle, state: number) => !ended && handle?.world === world
    && Number.isInteger(handle.slot) && handle.slot >= 0 && handle.slot < allocatedSlots
    && states[handle.slot] === state && generations[handle.slot] === handle.generation;
  const recycle = (handle: EntityHandle) => {
    if (ended) return;
    records.delete(handle.slot);
    if (generations[handle.slot] === 0xffffffff) { states[handle.slot] = 4; quarantined++; }
    else { states[handle.slot] = 0; free.push(handle.slot); }
  };
  return {
    active,
    reserve(name: string, components: readonly string[], authoredId?: string, data: Partial<Pick<WorldEntity, "model" | "primitive" | "character" | "parent" | "transform" | "tags" | "behaviors">> = {}, reservation?: symbol): WorldEntity {
      active();
      if (authoredId !== undefined && authored.has(authoredId)) throw new EntityWorldError("invalid-command", `Duplicate authored ID: ${authoredId}.`);
      const reserved = reservation === undefined ? undefined : reservationSlots.get(reservation);
      if (reserved !== undefined && states[reserved] !== 5) throw new EntityWorldError("capacity", "Pool slot has not finished retiring or is already active.");
      if (reserved !== undefined && generations[reserved] === 0xffffffff) throw new EntityWorldError("capacity", "Pool slot generation exhausted; dispose the pool.");
      const slot = reserved ?? (free.pop() ?? (allocatedSlots < capacity ? allocatedSlots++ : -1));
      if (slot < 0) throw new EntityWorldError("capacity", "Entity capacity reached; retiring slots cannot be reused yet.");
      if (reserved !== undefined) { dormant--; reused.add(slot); }
      if (reservation !== undefined) { reservationSlots.set(reservation, slot); owners.set(slot, reservation); }
      generations[slot]++; states[slot] = 1;
      return Object.freeze({ handle: Object.freeze({ world, slot, generation: generations[slot] }), name, components, authoredId, ...data, tags: data.tags ?? EMPTY_ENTITY_TAGS });
    },
    publish(entity: WorldEntity) {
      reused.delete(entity.handle.slot);
      records.set(entity.handle.slot, entity); states[entity.handle.slot] = 2; alive++;
      tags.add(entity);
      if (entity.parent) {
        let siblings = children.get(entity.parent.slot);
        if (!siblings) { siblings = new Map(); children.set(entity.parent.slot, siblings); }
        siblings.set(entity.handle.slot, entity.handle);
      }
      if (entity.authoredId === undefined) runtime++;
      else authored.set(entity.authoredId, entity.handle);
    },
    cancel(handle: EntityHandle, succeeded = true) {
      if (!matches(handle, 1)) return;
      if (succeeded && reused.delete(handle.slot)) { states[handle.slot] = 5; dormant++; }
      else {
        const token = owners.get(handle.slot);
        if (token !== undefined) reservationSlots.delete(token);
        owners.delete(handle.slot);
        if (succeeded) recycle(handle);
        else { states[handle.slot] = 4; quarantined++; }
      }
    },
    remove(entity: WorldEntity) {
      tags.remove(entity);
      if (entity.parent) {
        const siblings = children.get(entity.parent.slot); siblings?.delete(entity.handle.slot);
        if (!siblings?.size) children.delete(entity.parent.slot);
      }
      children.delete(entity.handle.slot);
      states[entity.handle.slot] = 3; records.delete(entity.handle.slot); alive--; retiring++;
      if (entity.authoredId === undefined) runtime--;
      else authored.delete(entity.authoredId);
    },
    retire(handle: EntityHandle, succeeded: boolean) {
      if (!matches(handle, 3)) return;
      retiring--;
      if (succeeded && owners.has(handle.slot)) { states[handle.slot] = 5; dormant++; }
      else if (succeeded) recycle(handle);
      else { states[handle.slot] = 4; quarantined++; }
    },
    reservationFor: (handle: EntityHandle) => owners.get(handle.slot),
    reservationState(token: symbol): ReservationState {
      if (ended) return "ended";
      const slot = reservationSlots.get(token);
      return slot === undefined ? "empty" : states[slot] === 5 ? "idle" : states[slot] === 2 ? "active" : states[slot] === 4 ? "quarantined" : "pending";
    },
    releaseReservation(token: symbol) {
      const slot = reservationSlots.get(token); if (slot === undefined || ended) return;
      if (states[slot] !== 5 && states[slot] !== 4) throw new EntityWorldError("invalid-command", "Pool reservation is still active or retiring.");
      reservationSlots.delete(token); owners.delete(slot);
      if (states[slot] === 5) { dormant--; recycle({ world, slot, generation: generations[slot] }); }
    },
    isAlive: (handle: EntityHandle) => matches(handle, 2),
    children: (handle: EntityHandle) => children.get(handle.slot)?.values() ?? [],
    inspect(handle: EntityHandle): WorldEntity {
      active();
      if (!matches(handle, 2)) throw new EntityWorldError("stale-handle", "Entity handle is stale or belongs to another world.");
      return records.get(handle.slot)!;
    },
    findByAuthoredId(id: string) { active(); return authored.get(id); },
    updateTags(before: WorldEntity, after: WorldEntity) { tags.remove(before); tags.add(after); records.set(after.handle.slot, after); },
    queryTag(tag: string, limit: number) { active(); return tags.query(tag, limit); },
    stats: () => ({ alive, runtime, allocatedSlots, capacity, retiring, quarantined, dormant, reserved: reservationSlots.size, ended, ...tags.stats() }),
    dispose() {
      if (ended) return;
      ended = true; records.clear(); authored.clear(); children.clear(); free.length = 0;
      tags.clear();
      alive = 0; runtime = 0; retiring = 0; quarantined = 0; dormant = 0; reservationSlots.clear(); owners.clear(); reused.clear();
    },
  };
}
export type EntitySlots = ReturnType<typeof createEntitySlots>;
