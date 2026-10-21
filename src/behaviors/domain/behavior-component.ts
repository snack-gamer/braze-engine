import { BEHAVIOR_DOCUMENT_LIMITS } from "./behavior-limits";
import { BehaviorValidationError, behaviorRecord, behaviorString, behaviorVersion, parseBehaviorValues } from "./behavior-validation";
export { BEHAVIOR_DOCUMENT_LIMITS } from "./behavior-limits";

export type BehaviorEntityReference = Readonly<{ entityId: string }>;
export type BehaviorValue = string | number | boolean | null | BehaviorEntityReference;
export type BehaviorValues = Readonly<Record<string, BehaviorValue>>;
export type BehaviorEntry = Readonly<{
  id: string;
  type: string;
  typeVersion: number;
  enabled: boolean;
  values: BehaviorValues;
  /** Unknown persisted metadata survives edits made by this engine version. */
  extensions?: Readonly<Record<string, unknown>>;
}>;
export type BehaviorComponent = Readonly<{
  version: 1;
  entries: readonly BehaviorEntry[];
  extensions?: Readonly<Record<string, unknown>>;
  /** Inert, visibly unavailable data is retained until explicitly removed. */
  unavailable?: Readonly<{ message: string; source: unknown }>;
}>;

export function createBehaviorComponent(): BehaviorComponent {
  return Object.freeze({ version: 1, entries: Object.freeze([]) });
}

/** Runtime capture owns only validated executable data, never opaque source metadata. */
export function captureBehaviorComponent(component: BehaviorComponent): BehaviorComponent {
  if (component.unavailable) return Object.freeze({
    version: 1, entries: Object.freeze([]),
    unavailable: Object.freeze({ message: component.unavailable.message, source: undefined }),
  });
  if (component.version !== 1 || !Array.isArray(component.entries)
    || component.entries.length > BEHAVIOR_DOCUMENT_LIMITS.entries) {
    throw new BehaviorValidationError("behaviors", `expected version 1 with at most ${BEHAVIOR_DOCUMENT_LIMITS.entries} entries`);
  }
  const ids = new Set<string>();
  return Object.freeze({
    version: 1,
    entries: Object.freeze(component.entries.map((entry, index) => {
      const input = behaviorRecord(entry, `entries[${index}]`);
      const id = behaviorString(input.id, "entry.id", BEHAVIOR_DOCUMENT_LIMITS.idLength);
      if (ids.has(id)) throw new BehaviorValidationError("entry.id", `duplicate attachment id ${id}`);
      ids.add(id);
      if (typeof input.enabled !== "boolean") throw new BehaviorValidationError(id, "enabled must be a boolean");
      return Object.freeze({
        id, type: behaviorString(input.type, `${id}.type`, BEHAVIOR_DOCUMENT_LIMITS.typeLength),
        typeVersion: behaviorVersion(input.typeVersion, `${id}.typeVersion`), enabled: input.enabled,
        values: parseBehaviorValues(input.values, `${id}.values`),
      });
    })),
  });
}
