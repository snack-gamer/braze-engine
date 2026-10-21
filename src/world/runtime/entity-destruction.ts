import { EntityWorldError, type EntityCommand, type EntityHandle } from "../domain/entity-world";
import type { EntitySlots } from "./entity-slots";

/** Expansion is bounded before any resource preparation or slot mutation. */
export function expandEntityDestruction(slots: EntitySlots, commands: readonly EntityCommand[]): readonly EntityCommand[] {
  const result: EntityCommand[] = [];
  const append = (command: EntityCommand) => {
    if (result.length === 128) throw new EntityWorldError("capacity", "A structural batch may affect at most 128 entities, including descendants.");
    result.push(command);
  };
  for (const command of commands) {
    if (command.op !== "destroySubtree") { append(command); continue; }
    const pending: EntityHandle[] = [command.handle];
    while (pending.length) {
      const handle = pending.pop()!;
      slots.inspect(handle);
      append({ op: "destroy", handle });
      for (const child of slots.children(handle)) {
        if (pending.length + result.length >= 128) throw new EntityWorldError("capacity", "A destroyed subtree may contain at most 128 entities.");
        pending.push(child);
      }
    }
  }
  return result;
}
