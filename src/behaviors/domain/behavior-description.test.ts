import { expect, it, vi } from "vitest";
import { describeBehaviorRegistry } from "./behavior-description";

it("publishes stable schema/defaults for automation without constructing or serializing code", () => {
  const create = vi.fn();
  const definitions = describeBehaviorRegistry([{ id: "project.example", label: "Example", version: 2,
    fields: [{ key: "speed", label: "Speed (m/s)", kind: "number", default: 0, min: 0, max: 20 },
      { key: "target", label: "Target", kind: "entity", default: null }], create }]);
  expect(JSON.parse(JSON.stringify(definitions))).toEqual([{ id: "project.example", label: "Example", version: 2,
    fields: [{ key: "speed", label: "Speed (m/s)", kind: "number", default: 0, min: 0, max: 20 },
      { key: "target", label: "Target", kind: "entity", default: null }] }]);
  expect(create).not.toHaveBeenCalled(); expect(Object.isFrozen(definitions[0].fields)).toBe(true);
  expect(() => describeBehaviorRegistry([{ id: "bad", label: "Bad", version: 1, fields: [
    { key: "speed", label: "Speed", kind: "number", default: Infinity }], create }])).toThrow(/finite/);
});
