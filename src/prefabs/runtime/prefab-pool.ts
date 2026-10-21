import { EntityWorldError, type EntityBatch, type EntityWorld } from "../../world/domain/entity-world";
import type { EntityReservationGroup } from "../../world/runtime/entity-reservations";
import type { PrefabPool } from "../domain/prefab-pool";
import type { PrefabBatch, PrefabBatchState, PrefabInstance, PrefabPlacement } from "../domain/runtime-prefab";
import type { RuntimePrefabTemplate } from "./runtime-prefabs";

type Member = {
  tokens: readonly symbol[]; state: "available" | "acquiring" | "active" | "returning" | "quarantined";
  retained: boolean; instance?: PrefabInstance; ticket?: EntityBatch; receipt?: PrefabBatchState;
};

/** No frame callback: reconcile bounded members only when the pool is used or inspected. */
export function createPrefabPool(world: EntityWorld, template: RuntimePrefabTemplate, capacity: number, group: EntityReservationGroup): PrefabPool {
  const members: Member[] = Array.from({ length: capacity }, (_, i) => ({
    tokens: group.tokens.slice(i * template.nodes, (i + 1) * template.nodes), state: "available", retained: false,
  }));
  const owned = new WeakMap<PrefabInstance, Member>();
  let disposed = false, acquisitions = 0, reuses = 0;
  const active = () => {
    if (world.stats().ended) throw new EntityWorldError("world-ended", "This prefab pool world has ended.");
    if (disposed) throw new EntityWorldError("stale-handle", "This prefab pool has been disposed.");
  };
  const reconcile = (member: Member) => {
    if (!member.ticket) return;
    const result = member.ticket.read();
    if (result.status === "rejected") {
      member.state = member.instance ? "active" : "available";
      member.ticket = undefined; member.receipt = result; return;
    }
    if (result.status !== "committed") return;
    if (member.state === "acquiring") {
      const instance = Object.freeze({ asset: template.asset, revision: template.revision, root: result.created[template.rootKey], entities: result.created });
      member.instance = instance; owned.set(instance, member); member.state = "active";
      member.receipt = Object.freeze({ status: "committed", tick: result.tick, instance });
      member.ticket = undefined; acquisitions++; if (member.retained) reuses++; member.retained = true;
    } else if (member.state === "returning") {
      member.instance = undefined;
      const states = member.tokens.map(group.state);
      if (states.includes("quarantined")) { member.state = "quarantined"; member.ticket = undefined; }
      else if (states.every((state) => state === "idle" || state === "empty")) { member.state = "available"; member.ticket = undefined; }
    }
  };
  const refresh = () => { if (!disposed && !world.stats().ended) members.forEach(reconcile); };
  return Object.freeze({
    acquire(placement?: PrefabPlacement): PrefabBatch {
      active(); refresh();
      const member = members.find((item) => item.state === "available");
      if (!member) throw new EntityWorldError("capacity", "Prefab pool exhausted; return a lease and wait for retirement before acquiring again.");
      const commands = template.create(placement);
      const bindings = new Map(commands.map((command, i) => {
        if (command.op !== "create") throw new EntityWorldError("invalid-command", "Prefab templates must contain creation commands.");
        return [command.key, member.tokens[i]];
      }));
      const ticket = group.submit(commands, bindings);
      member.ticket = ticket; member.receipt = undefined; member.state = "acquiring";
      let receipt: PrefabBatchState | undefined;
      return Object.freeze({ read() {
        // Capture this lease's result even after the member starts another cycle.
        if (receipt) return receipt;
        reconcile(member);
        const result = ticket.read();
        if (result.status === "rejected") receipt = result;
        else if (result.status === "committed") {
          const instance = member.receipt?.status === "committed" && member.receipt.tick === result.tick
            ? member.receipt.instance : Object.freeze({ asset: template.asset, revision: template.revision, root: result.created[template.rootKey], entities: result.created });
          receipt = Object.freeze({ status: "committed", tick: result.tick, instance });
        }
        return receipt ?? result as PrefabBatchState;
      } });
    },
    release(instance: PrefabInstance) {
      active(); refresh();
      const member = owned.get(instance);
      if (!member || member.instance !== instance || member.state !== "active" || !world.isAlive(instance.root)) throw new EntityWorldError("stale-handle", "Pool lease is stale, already returning or belongs to another pool.");
      const ticket = group.submit(Object.values(instance.entities).map((handle) => ({ op: "destroy", handle })));
      member.ticket = ticket; member.state = "returning"; return ticket;
    },
    isAlive(instance: PrefabInstance) {
      const member = owned.get(instance); return !disposed && member?.instance === instance && world.isAlive(instance.root);
    },
    stats() {
      refresh(); const ended = world.stats().ended, stopped = ended || disposed;
      const count = (state: Member["state"]) => stopped ? 0 : members.filter((member) => member.state === state).length;
      return Object.freeze({ capacity, active: count("active"), available: count("available"), pending: count("acquiring") + count("returning"),
        quarantined: count("quarantined"), retained: stopped ? 0 : members.filter((member) => member.retained).length,
        acquisitions, reuses, disposed, ended });
    },
    dispose() {
      if (disposed) return;
      refresh(); group.dispose(); disposed = true;
      for (const member of members) { member.instance = undefined; member.ticket = undefined; member.receipt = undefined; }
    },
  });
}
