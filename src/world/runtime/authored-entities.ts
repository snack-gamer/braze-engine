import { EntityWorldError, type WorldEntity } from "../domain/entity-world";
import { captureEntityTags } from "../domain/entity-tags";
import type { EntitySlots } from "./entity-slots";

export type AuthoredEntity = Readonly<{ id: string; name: string; parentId?: string | null; tags?: readonly string[] }>;

/** Capture identity and hierarchy once, retaining input slot order even when children precede parents. */
export function captureAuthoredEntities(slots: EntitySlots, source: readonly AuthoredEntity[], validateTags: (tags: readonly string[]) => void) {
  const records = new Map<string, WorldEntity>(), parents = new Map<string, string>();
  for (const entity of source) {
    if (!entity.id || typeof entity.name !== "string" || records.has(entity.id)) {
      throw new EntityWorldError("invalid-command", "Authored entities require unique IDs and string names.");
    }
    const tags = captureEntityTags(entity.tags); validateTags(tags);
    records.set(entity.id, slots.reserve(entity.name, Object.freeze([]), entity.id, { tags }));
    if (entity.parentId) parents.set(entity.id, entity.parentId);
  }
  const checked = new Set<string>();
  for (const id of records.keys()) {
    const path = new Set<string>();
    let current: string | undefined = id;
    while (current && !checked.has(current)) {
      if (!records.has(current) || path.has(current)) throw new EntityWorldError("invalid-command", "Authored parents must form an acyclic hierarchy within the captured scene.");
      path.add(current); current = parents.get(current);
    }
    for (const visited of path) checked.add(visited);
  }
  for (const [id, entity] of records) {
    const parentId = parents.get(id);
    slots.publish(parentId ? Object.freeze({ ...entity, parent: records.get(parentId)!.handle }) : entity);
  }
}
