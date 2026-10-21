import { captureBehaviorComponent, type BehaviorComponent, type BehaviorEntry } from "../domain/behavior-component";
import { BehaviorValidationError, behaviorRecord } from "../domain/behavior-validation";

const COMPONENT_FIELDS = new Set(["version", "entries"]);
const ENTRY_FIELDS = new Set(["id", "type", "typeVersion", "enabled", "values"]);

/** Extension metadata is cold persisted JSON and never part of executable capture. */
function extensions(input: Record<string, unknown>, known: ReadonlySet<string>): Readonly<Record<string, unknown>> | undefined {
  const retained = Object.fromEntries(Object.entries(input).filter(([key]) => !known.has(key)));
  return Object.keys(retained).length ? Object.freeze(retained) : undefined;
}

/** Strict boundary for authored commands; invalid input never becomes an active component. */
export function parseBehaviorComponent(value: unknown): BehaviorComponent {
  const input = behaviorRecord(value, "behaviors");
  if (input.version !== 1) throw new BehaviorValidationError("behaviors.version", "unsupported component version; expected 1");
  const captured = captureBehaviorComponent({ version: 1, entries: input.entries as readonly BehaviorEntry[] });
  const entries = captured.entries.map((entry, index): BehaviorEntry => {
    const preserved = extensions((input.entries as Record<string, unknown>[])[index], ENTRY_FIELDS);
    return preserved ? Object.freeze({ ...entry, extensions: preserved }) : entry;
  });
  const preserved = extensions(input, COMPONENT_FIELDS);
  return Object.freeze({ version: 1, entries: Object.freeze(entries), ...(preserved ? { extensions: preserved } : {}) });
}

/** Load failure retains its original envelope instead of silently deleting user data. */
export function decodeBehaviorComponent(value: unknown): BehaviorComponent | undefined {
  if (value === undefined || value === null) return undefined;
  try { return parseBehaviorComponent(value); }
  catch (error) {
    return Object.freeze({
      version: 1, entries: Object.freeze([]),
      unavailable: Object.freeze({
        message: error instanceof Error ? error.message : "Invalid behavior component",
        source: value,
      }),
    });
  }
}

export function encodeBehaviorComponent(component: BehaviorComponent | undefined): unknown {
  if (!component) return null;
  if (component.unavailable) return component.unavailable.source;
  // Validate before saving but preserve authored extension fields separately.
  const captured = captureBehaviorComponent(component);
  return {
    ...component.extensions, version: 1,
    entries: captured.entries.map((entry, index) => ({
      ...component.entries[index].extensions,
      id: entry.id, type: entry.type, typeVersion: entry.typeVersion, enabled: entry.enabled,
      values: entry.values,
    })),
  };
}
