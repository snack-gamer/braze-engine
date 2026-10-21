import { describe, expect, it } from "vitest";
import type { SceneObject } from "../../scene/domain/scene-object";
import type { BehaviorRegistration } from "../domain/behavior-registration";
import { createBehaviorComponent } from "../domain/behavior-component";
import {
  addBehaviorComponent, addBehaviorEntry, behaviorEntryIssue, removeBehaviorComponent,
  removeBehaviorEntry, resetBehaviorEntryValues, setBehaviorEntryEnabled, setBehaviorFieldValue,
} from "./behavior-authoring";

const registration: BehaviorRegistration = {
  id: "test.counter", label: "Counter", version: 1,
  fields: [{ kind: "number", key: "speed", label: "Speed", default: 1, min: 0, max: 10 },
    { kind: "boolean", key: "active", label: "Active", default: true }],
  create: () => ({ dispose() {} }),
};
function object(): SceneObject {
  return { id: "cube", name: "Cube", primitive: "cube", visible: true, locked: false,
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#fff", behaviors: createBehaviorComponent() };
}
function attached(): SceneObject {
  const source = object();
  return { ...source, ...addBehaviorEntry(source, registration, "counter") };
}

describe("behavior authoring operations", () => {
  it("creates explicit persisted defaults without invoking the behavior", () => {
    const source = object();
    const patch = addBehaviorEntry(source, { ...registration, create: () => { throw new Error("must not run"); } }, "one");
    expect(patch.behaviors?.entries).toEqual([{ id: "one", type: "test.counter", typeVersion: 1, enabled: true, values: { speed: 1, active: true } }]);
    expect(source.behaviors?.entries).toEqual([]);
    expect(addBehaviorComponent()).toEqual({ behaviors: { version: 1, entries: [] } });
  });

  it("changes only a named field while retaining unknown values and extension metadata", () => {
    const source = attached();
    source.behaviors = { ...source.behaviors!, extensions: { vendor: "retained" }, entries: [
      { ...source.behaviors!.entries[0], values: { speed: 5, active: true, future: "keep" }, extensions: { versionHint: 3 } },
    ] };
    const patch = setBehaviorFieldValue(source, "counter", registration, "speed", 0);
    expect(patch.behaviors?.entries[0]).toMatchObject({ values: { speed: 0, active: true, future: "keep" }, extensions: { versionHint: 3 } });
    expect(patch.behaviors?.extensions).toEqual({ vendor: "retained" });
    expect(source.behaviors.entries[0].values.speed).toBe(5);
    expect(setBehaviorFieldValue(source, "counter", registration, "active", false).behaviors?.entries[0].values.active).toBe(false);
  });

  it("allows repairing invalid fields individually while rejecting invalid writes and version mismatches", () => {
    const source = attached();
    source.behaviors = { ...source.behaviors!, entries: [{ ...source.behaviors!.entries[0], values: { speed: "bad", active: "also bad" } }] };
    expect(setBehaviorFieldValue(source, "counter", registration, "speed", 3).behaviors?.entries[0].values).toEqual({ speed: 3, active: "also bad" });
    expect(() => setBehaviorFieldValue(source, "counter", registration, "speed", 11)).toThrow();
    expect(() => setBehaviorFieldValue(source, "counter", registration, "absent", 1)).toThrow("not registered");
    expect(() => setBehaviorFieldValue(source, "counter", { ...registration, version: 2 }, "speed", 1)).toThrow("version");
  });

  it("disables and removes attachments without removing their object or sibling", () => {
    let source = attached();
    source = { ...source, ...addBehaviorEntry(source, registration, "sibling") };
    const disabled = setBehaviorEntryEnabled(source, "counter", false);
    expect(disabled.behaviors?.entries.map((entry) => entry.enabled)).toEqual([false, true]);
    expect(removeBehaviorEntry(source, "counter").behaviors?.entries.map((entry) => entry.id)).toEqual(["sibling"]);
    expect(removeBehaviorComponent()).toEqual({ behaviors: undefined });
    expect(source.behaviors?.entries).toHaveLength(2);
  });

  it("resets invalid supported settings while preserving entry identity, enabled state and unknown metadata", () => {
    const source = attached();
    source.behaviors = { ...source.behaviors!, entries: [{ ...source.behaviors!.entries[0], enabled: false,
      values: { speed: 100, active: "invalid", future: "retained" }, extensions: { vendor: 2 } }] };
    expect(resetBehaviorEntryValues(source, "counter", registration).behaviors?.entries[0]).toMatchObject({
      id: "counter", enabled: false, values: { speed: 1, active: true, future: "retained" }, extensions: { vendor: 2 },
    });
    expect(source.behaviors.entries[0].values.speed).toBe(100);
    expect(() => resetBehaviorEntryValues(source, "counter", { ...registration, version: 2 })).toThrow("version");
  });

  it("keeps unknown types and versions removable while unavailable envelopes require explicit component removal", () => {
    const source = attached();
    const entry = source.behaviors!.entries[0];
    expect(behaviorEntryIssue(entry, undefined)).toContain("Missing definition");
    expect(behaviorEntryIssue(entry, { ...registration, version: 2 })).toContain("Saved version 1");
    expect(behaviorEntryIssue(entry, registration)).toBeUndefined();
    source.behaviors = { version: 1, entries: [], unavailable: { message: "Future version", source: { version: 99 } } };
    expect(() => addBehaviorEntry(source, registration, "new")).toThrow("unavailable");
    expect(() => setBehaviorEntryEnabled(source, "counter", true)).toThrow("unavailable");
    expect(removeBehaviorComponent()).toEqual({ behaviors: undefined });
  });

  it("enforces bounded attachments and persistent identity uniqueness", () => {
    let source = attached();
    expect(() => addBehaviorEntry(source, registration, "counter")).toThrow("identity");
    for (let index = 1; index < 8; index++) source = { ...source, ...addBehaviorEntry(source, registration, `counter-${index}`) };
    expect(() => addBehaviorEntry(source, registration, "overflow")).toThrow("up to 8");
    expect(() => setBehaviorEntryEnabled(source, "removed", true)).toThrow("no longer exists");
  });
});
