import type { EntityHandle } from "../../world/domain/entity-world";

type Owner = { entity: EntityHandle; label: string; released: boolean };

/** One live generation owns each sparse movement writer; old leases never release a replacement. */
export function createCharacterMovementOwnership(isAlive: (entity: EntityHandle) => boolean) {
  const owners = new Map<number, Owner>();
  const release = (owner: Owner) => {
    if (owner.released) return;
    owner.released = true;
    if (owners.get(owner.entity.slot) === owner) owners.delete(owner.entity.slot);
  };
  return {
    acquire(entity: EntityHandle, label = "character movement") {
      if (typeof label !== "string" || !label.trim() || label.length > 256) throw new Error("Movement owner requires a nonempty label of at most 256 characters.");
      const previous = owners.get(entity.slot);
      if (previous && !isAlive(previous.entity)) release(previous);
      if (owners.has(entity.slot)) throw new Error(`Character movement is owned by ${previous!.label}.`);
      const owner: Owner = { entity, label, released: false }; owners.set(entity.slot, owner);
      return owner;
    },
    assertWriter(entity: EntityHandle, owner?: Owner) {
      if (owner?.released) throw new Error("This character movement lease has ended.");
      const current = owners.get(entity.slot);
      if (owner && current !== owner) throw new Error("This character movement lease has ended.");
      if (current && current !== owner) throw new Error(`Character movement is owned by ${current.label}; use its lease.`);
    },
    release,
    prune() { for (const owner of owners.values()) if (!isAlive(owner.entity)) release(owner); },
    dispose() { for (const owner of owners.values()) release(owner); },
  };
}
