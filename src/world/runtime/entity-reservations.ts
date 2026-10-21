import { EntityWorldError, type EntityBatch, type EntityCommand } from "../domain/entity-world";

export type ReservationState = "empty" | "active" | "pending" | "idle" | "quarantined" | "ended";
/** Engine-internal pool ownership. Project world commands cannot consume these reservations. */
export type EntityReservationGroup = Readonly<{
  tokens: readonly symbol[];
  submit: (commands: readonly EntityCommand[], bindings?: ReadonlyMap<string, symbol>) => EntityBatch;
  state: (token: symbol) => ReservationState;
  dispose: () => void;
}>;
export type EntityReservationPort = Readonly<{ allocate: (count: number) => EntityReservationGroup }>;
type Owner = {
  active: () => void;
  state: (token: symbol) => ReservationState;
  submit: (commands: readonly EntityCommand[], tokens: ReadonlySet<symbol>, bindings: ReadonlyMap<string, symbol>) => EntityBatch;
  release: (tokens: readonly symbol[]) => void;
};

/** Bounds reservations independently of the logical/physical startup capacities. */
export function createEntityReservations(owner: Owner): EntityReservationPort {
  let allocated = 0;
  return Object.freeze({ allocate(count: number) {
    owner.active();
    if (!Number.isInteger(count) || count < 1 || allocated + count > 4096) throw new EntityWorldError("capacity", "Pool reservations require 1–4096 nodes in total per world.");
    const tokens = Object.freeze(Array.from({ length: count }, () => Symbol("pooled-entity"))), set = new Set(tokens);
    allocated += count; let disposed = false;
    const pending = new Set<EntityBatch>();
    const prune = () => { for (const batch of pending) if (["committed", "rejected"].includes(batch.read().status)) pending.delete(batch); };
    const active = () => { owner.active(); if (disposed) throw new EntityWorldError("stale-handle", "This pool has been disposed."); };
    return Object.freeze({ tokens,
      state(token: symbol) { if (disposed) return "ended"; if (!set.has(token)) throw new EntityWorldError("invalid-command", "Foreign pool reservation."); return owner.state(token); },
      submit(commands: readonly EntityCommand[], bindings: ReadonlyMap<string, symbol> = new Map()) {
        active();
        for (const token of bindings.values()) if (!set.has(token)) throw new EntityWorldError("invalid-command", "Foreign pool reservation.");
        prune(); const batch = owner.submit(commands, set, bindings); pending.add(batch); return batch;
      },
      dispose() {
        if (disposed) return;
        prune(); if (pending.size) throw new EntityWorldError("invalid-command", "Pool commands are still pending.");
        for (const token of tokens) if (["active", "pending"].includes(owner.state(token))) throw new EntityWorldError("invalid-command", "Return all pool leases and wait for retirement before disposing the pool.");
        owner.release(tokens); allocated -= count; disposed = true;
      },
    });
  } });
}
