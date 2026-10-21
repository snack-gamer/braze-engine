import { describe, expect, it } from "vitest";
import { BEHAVIOR_DOCUMENT_LIMITS, captureBehaviorComponent, type BehaviorValues } from "./behavior-component";
import { createBehaviorEntry, resolveBehaviorValues, validateBehaviorRegistry } from "./behavior-registry";
import type { BehaviorRegistration } from "./behavior-registration";

const registration = (): BehaviorRegistration => ({
  id: "project.counter", label: "Counter", version: 1,
  fields: [
    { kind: "number", key: "speed", label: "Speed", default: 2, min: 0, max: 10 },
    { kind: "boolean", key: "active", label: "Active", default: true },
    { kind: "string", key: "message", label: "Message", default: "Hello", maxLength: 8 },
    { kind: "entity", key: "target", label: "Target", default: { entityId: "hero" } },
  ],
  create: () => ({ dispose() {} }),
});

describe("authored behavior registry", () => {
  it("captures a bounded registry, fills only absent defaults and preserves unknown values", () => {
    const source = registration();
    const [captured] = validateBehaviorRegistry([source]);
    expect(Object.isFrozen(captured.fields)).toBe(true);
    expect(Object.isFrozen(captured.fields[3].default)).toBe(true);
    const values = resolveBehaviorValues(captured, { speed: 0, active: false, message: "", target: null, oldField: 12 });
    expect(values).toEqual({ speed: 0, active: false, message: "", target: null, oldField: 12 });
    const entry = createBehaviorEntry(captured, "counter-1");
    expect(entry).toMatchObject({ type: "project.counter", typeVersion: 1, enabled: true, values: { speed: 2, target: { entityId: "hero" } } });
    expect(Object.isFrozen(entry.values.target)).toBe(true);
  });

  it("rejects duplicate types, duplicate fields, unsupported kinds and invalid defaults", () => {
    const source = registration();
    expect(() => validateBehaviorRegistry([source, source])).toThrow("duplicate behavior registration");
    expect(() => validateBehaviorRegistry([{ ...source, fields: [source.fields[0], source.fields[0]] }])).toThrow("duplicate field key");
    expect(() => validateBehaviorRegistry([{ ...source, fields: [{ ...source.fields[0], kind: "asset" } as never] }])).toThrow("unsupported field kind");
    expect(() => validateBehaviorRegistry([{ ...source, fields: [{ kind: "number", key: "speed", label: "Speed", default: 20, max: 10 }] }])).toThrow("range");
    expect(() => validateBehaviorRegistry([{ ...source, id: "/scripts/counter.ts" }])).toThrow("type identity");
    expect(() => validateBehaviorRegistry([{ ...source, fields: [{ kind: "entity", key: "target", label: "Target", default: { entityId: "" } }] }])).toThrow("entityId");
  });

  it("rejects malformed schemas and over-budget registries before activation", () => {
    const source = registration();
    expect(() => validateBehaviorRegistry(Array.from({ length: 129 }, (_, index) => ({ ...source, id: `b${index}` })))).toThrow("128");
    expect(() => validateBehaviorRegistry([{ ...source, fields: Array.from({ length: 33 }, (_, index) => ({ kind: "boolean", key: `b${index}`, label: "Flag", default: true })) }])).toThrow("32");
    expect(() => validateBehaviorRegistry([{ ...source, version: 0 }])).toThrow("positive integer");
    expect(() => validateBehaviorRegistry([{ ...source, fields: [{ kind: "number", key: "n", label: "Number", default: 2, min: 3, max: 1 }] }])).toThrow("minimum");
    expect(() => validateBehaviorRegistry([{ ...source, fields: [{ kind: "string", key: "s", label: "String", default: "", maxLength: 1025 }] }])).toThrow("text limit");
  });

  it("reports incompatible known field values without reinterpreting them", () => {
    const source = registration();
    const invalid: BehaviorValues[] = [{ speed: "2" }, { speed: -1 }, { active: 0 }, { message: "over eight characters" }, { target: false }];
    for (const values of invalid) {
      expect(() => resolveBehaviorValues(source, values)).toThrow();
    }
    expect(() => resolveBehaviorValues(source, { extra: Number.POSITIVE_INFINITY })).toThrow("finite number");
    expect(() => resolveBehaviorValues(source, { extra: "x".repeat(1025) })).toThrow("bounded string");
  });

  it("validates and snapshots runtime commands without retaining source extension data", () => {
    const entry = createBehaviorEntry(registration(), "instance");
    const mutable = { ...entry, values: { target: { entityId: "original" } } };
    const captured = captureBehaviorComponent({ version: 1, entries: [mutable], extensions: { editor: "only" } });
    mutable.values.target.entityId = "changed";
    expect(captured.entries[0].values.target).toEqual({ entityId: "original" });
    expect(captured.extensions).toBeUndefined();
    expect(() => captureBehaviorComponent({ version: 1, entries: Array.from({ length: BEHAVIOR_DOCUMENT_LIMITS.entries + 1 }, () => entry) })).toThrow("8 entries");
    expect(() => captureBehaviorComponent({ version: 1, entries: [entry, entry] })).toThrow("duplicate attachment id");
    expect(() => captureBehaviorComponent({ version: 1, entries: [{ ...entry, values: { bad: Number.NaN } }] })).toThrow("finite number");
    const unavailable = captureBehaviorComponent({ version: 1, entries: [], unavailable: { message: "Future version", source: { code: "unread" } } });
    expect(unavailable).toEqual({ version: 1, entries: [], unavailable: { message: "Future version", source: undefined } });
  });
});
