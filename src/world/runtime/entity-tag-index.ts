import { EntityWorldError, type EntityHandle, type WorldEntity } from "../domain/entity-world";
import { captureEntityTag, MAX_TAG_QUERY_RESULTS, type EntityTagQuery } from "../domain/entity-tags";

/** Membership changes only at publication. Queries visit at most the requested matches. */
export function createEntityTagIndex() {
  const tags = new Map<string, Map<number, EntityHandle>>();
  let memberships = 0;
  return {
    add(entity: WorldEntity) {
      for (const tag of entity.tags) {
        let members = tags.get(tag);
        if (!members) { members = new Map(); tags.set(tag, members); }
        members.set(entity.handle.slot, entity.handle); memberships++;
      }
    },
    remove(entity: WorldEntity) {
      for (const tag of entity.tags) {
        const members = tags.get(tag);
        if (members?.delete(entity.handle.slot)) memberships--;
        if (!members?.size) tags.delete(tag);
      }
    },
    query(tag: string, limit: number): EntityTagQuery {
      captureEntityTag(tag);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TAG_QUERY_RESULTS) {
        throw new EntityWorldError("invalid-command", `Tag query limit must be 1–${MAX_TAG_QUERY_RESULTS}.`);
      }
      const members = tags.get(tag), handles: EntityHandle[] = [];
      if (members) for (const handle of members.values()) {
        handles.push(handle); if (handles.length === limit) break;
      }
      const total = members?.size ?? 0;
      return Object.freeze({ handles: Object.freeze(handles), total, truncated: handles.length < total });
    },
    stats: () => ({ tagKinds: tags.size, tagMemberships: memberships }),
    clear() { tags.clear(); memberships = 0; },
  };
}
