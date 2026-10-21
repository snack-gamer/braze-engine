import type { BehaviorComponent } from "./behavior-component";

/** Internal references follow a cloned subtree; references outside it retain their authored identity. */
export function remapBehaviorReferences(
  component: BehaviorComponent | undefined,
  idMap: ReadonlyMap<string, string>,
): BehaviorComponent | undefined {
  if (!component || component.unavailable) return component;
  return {
    ...component,
    entries: component.entries.map((entry) => ({
      ...entry,
      values: Object.fromEntries(Object.entries(entry.values).map(([key, value]) => [
        key, value !== null && typeof value === "object"
          ? { entityId: idMap.get(value.entityId) ?? value.entityId }
          : value,
      ])),
    })),
  };
}
